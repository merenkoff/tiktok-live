// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product card on its own page (TechDocs/POS_CLOTHING.md, phase C1e).
//
// It used to be a form spliced into the list in place of the product's row,
// with every variant fully expanded — a garment in ten sizes was a screen
// seven thousand pixels tall, and the one «Зберегти» sat at the very bottom.
// Now: `/admin/products/:id`, two columns on a laptop, the variants as a table,
// the rarely touched fields of one variant in a sheet, adding variants in a
// dialog, and a save bar that never scrolls away.
//
// Two halves of state: `snapshot` is what the server has, `draft` is what the
// owner typed; «what changed» is a comparison of the two (`lib/productDraft`),
// so only the changed rows are written, a failed row is named, and «Зберегти»
// is dark while there is nothing to save.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, uahInputToCents, useVertical } from '@pos/platform';
import type { ModifierGroup, PosTag, Product } from '@pos/platform';
import { Package, PageHeader, SectionHead } from '@pos/platform/ui';
import { ConfirmSheet } from '../../../components/cashier/ConfirmSheet';
import { AddVariantsDialog } from '../components/AddVariantsDialog';
import { ProductFields } from '../components/ProductFields';
import { ProductSide } from '../components/ProductSide';
import { VariantSheet } from '../components/VariantSheet';
import { VariantsSection } from '../components/VariantsSection';
import { componentOptions } from '../components/componentOptions';
import { productFormScope } from '../components/productFormScope';
import { flattenTags } from '../components/tagLabels';
import { colourVocabulary, supportsMatrix } from '../components/variantMatrix';
import { listTechCards, type TechCardRow } from '../data/techCardsApi';
import {
  detailsOf,
  diffProduct,
  draftOf,
  isDirty,
  rowName,
  variantDraftOf,
  variantPayload,
  type ComponentsMode,
  type ProductDraft,
  type VariantDraft,
} from '../lib/productDraft';
import { batchErrorMessage, saveErrorMessage } from '../lib/saveErrors';
import { useLeaveGuard } from '../lib/useLeaveGuard';

/** What the list hands over so «← Товари» lands on the same search and tag. */
interface CardLocationState {
  list?: string;
  /** One sentence to show once — the create page says what it could not finish. */
  flash?: string;
}

type Confirm =
  | { kind: 'leave'; href: string }
  | { kind: 'discard' }
  | { kind: 'archiveVariant'; id: number };

/** A variant write that failed, with the row it was for — so the page can say which. */
class RowFailure extends Error {
  constructor(
    public readonly row: VariantDraft,
    public readonly cause: unknown
  ) {
    super('variant write failed');
  }
}

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const vertical = useVertical();
  const state = (location.state ?? null) as CardLocationState | null;
  const listSearch = state?.list ?? '';

  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<PosTag[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [techCards, setTechCards] = useState<Map<number, TechCardRow>>(new Map());
  const [snapshot, setSnapshot] = useState<ProductDraft | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(state?.flash ?? null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sheet, setSheet] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const flatTags = useMemo(() => flattenTags(tags), [tags]);
  const colours = useMemo(() => colourVocabulary(products), [products]);
  const maxDepth = vertical.maxCompositionDepth ?? 1;
  const partOptions = useMemo(
    () => componentOptions(products, { excludeProductId: productId, maxDepth }),
    [products, productId, maxDepth]
  );

  const diff = useMemo(() => (snapshot && draft ? diffProduct(snapshot, draft) : null), [snapshot, draft]);
  const dirty = diff ? isDirty(diff) : false;

  const reload = useCallback(async (): Promise<Product | undefined> => {
    const [plist, tlist, glist, cards] = await Promise.all([
      api.getProducts(),
      api.getTags(),
      api.listModifierGroups(),
      // Empty for a shop with no composites — and never fails the page: the
      // card is the point here, the cost figure is a bonus beside it.
      listTechCards().catch(() => [] as TechCardRow[]),
    ]);
    setProducts(plist);
    setTags(tlist);
    setGroups(glist);
    setTechCards(new Map(cards.map((c) => [c.variant_id, c])));
    return plist.find((p) => p.id === productId && p.is_active);
  }, [productId]);

  useEffect(() => {
    let alive = true;
    setSnapshot(null);
    setDraft(null);
    setNotFound(false);
    if (!Number.isInteger(productId) || productId <= 0) {
      setNotFound(true);
      return;
    }
    reload()
      .then((product) => {
        if (!alive) return;
        if (!product) {
          setNotFound(true);
          return;
        }
        const d = draftOf(product);
        setSnapshot(d);
        setDraft(d);
      })
      .catch(() => {
        if (alive) setError('Не вдалося завантажити');
      });
    return () => {
      alive = false;
    };
  }, [productId, reload]);

  // «Збережено» lingers long enough to be read, then the bar goes quiet again.
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(t);
  }, [saved]);

  const onLeave = useCallback((href: string) => setConfirm({ kind: 'leave', href }), []);
  useLeaveGuard(dirty, onLeave);

  const patchDraft = (patch: Partial<ProductDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const patchVariant = (variantId: number, patch: Partial<VariantDraft>) =>
    setDraft((d) =>
      d ? { ...d, variants: d.variants.map((v) => (v.id === variantId ? { ...v, ...patch } : v)) } : d
    );

  /**
   * The card after the server changed its rows (a variant added or archived):
   * the server's rows in the server's order, but each one the owner already
   * has open keeps what they typed into it — replacing the list wholesale
   * threw away an unsaved edit of another row. Applied to both halves, so the
   * new row is clean and the edited one is still dirty.
   */
  function mergeAdded(updated: Product) {
    const server = updated.variants.filter((v) => v.is_active).map(variantDraftOf);
    setSnapshot((s) => (s ? { ...s, variants: server } : s));
    setDraft((d) => {
      if (!d) return d;
      const mine = new Map(d.variants.map((v) => [v.id, v]));
      return { ...d, variants: server.map((v) => mine.get(v.id) ?? v) };
    });
  }

  async function writeVariants(rows: VariantDraft[], mode: ComponentsMode): Promise<void> {
    for (const row of rows) {
      try {
        await api.updateVariant(row.id, variantPayload(row, mode));
      } catch (err) {
        throw new RowFailure(row, err);
      }
    }
  }

  /**
   * The product's shape and its variants, in whichever order the server will
   * accept — it enforces four rules and two of them are ordering rules:
   *
   * - a simple product may not carry a composition, so becoming composite has
   *   to happen **before** the compositions are written;
   * - a composite may not become simple while a composition still exists, so
   *   those have to be cleared **first** — on every variant that still has one
   *   on the server, not only the rows the owner touched;
   * - a derived composite needs every variant composed, so simple → derived
   *   cannot be one write. It goes through `own` (which has no such rule),
   *   the compositions land, and only then the mode flips. If that last step
   *   is refused — a derived composite may not hold stock — the product stays
   *   a perfectly valid `own` composite and the message says what to do.
   *
   * Only the CHANGED rows are written otherwise: a card of twelve sizes with
   * one price fixed is one request, not twelve.
   */
  async function saveShapeAndVariants(current: ProductDraft, before: ProductDraft): Promise<void> {
    const d = diffProduct(before, current);
    const details = detailsOf(current);
    const changed = d.variants;

    if (!d.shape) {
      if (d.details) await api.updateProduct(productId, details);
      await writeVariants(changed, current.shape ? 'keep' : 'omit');
      return;
    }

    if (current.shape === '') {
      const hadComposition = new Set(before.variants.filter((v) => v.components.length > 0).map((v) => v.id));
      const toClear = current.variants.filter((v) => hadComposition.has(v.id) || changed.includes(v));
      await writeVariants(toClear, 'clear');
      await api.updateProduct(productId, { ...details, kind: 'simple' });
      return;
    }

    await api.updateProduct(productId, { ...details, kind: 'composite', stock_mode: 'own' });
    await writeVariants(changed, 'keep');
    if (current.shape === 'derived') {
      await api.updateProduct(productId, { stock_mode: 'derived' });
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || !snapshot || !diff || saving || !dirty) return;
    setError(null);
    setFlash(null);
    setRowErrors({});
    if (draft.name.trim() === '') {
      setError('Вкажіть назву');
      return;
    }
    const unpriced = diff.variants.filter((v) => uahInputToCents(v.price) <= 0);
    if (unpriced.length > 0) {
      setRowErrors(Object.fromEntries(unpriced.map((v) => [v.id, 'Вкажіть ціну'])));
      setError('Вкажіть ціну');
      return;
    }

    setSaving(true);
    try {
      await saveShapeAndVariants(draft, snapshot);
      if (diff.tags) await api.setProductTags(productId, draft.tagIds);
      // Sent whole, like tags: an empty list is how a question is taken away.
      if (diff.groups) await api.setProductModifierGroups(productId, draft.groupIds);
      const fresh = await reload();
      if (fresh) {
        const d = draftOf(fresh);
        setSnapshot(d);
        setDraft(d);
      }
      setSaved(true);
    } catch (err) {
      if (err instanceof RowFailure) {
        const message = batchErrorMessage(err.cause, 'Не вдалося зберегти варіант');
        setRowErrors({ [err.row.id]: message });
        setError(`${rowName(err.row)}: ${message}`);
      } else {
        setError(saveErrorMessage(err, 'Не вдалося зберегти'));
      }
      // Whatever was written before the failure is the server's now: the
      // snapshot takes it, the draft keeps what was typed, and «Зберегти»
      // stays lit for exactly what is still unsaved.
      try {
        const fresh = await reload();
        if (fresh) setSnapshot(draftOf(fresh));
      } catch {
        /* the old snapshot stands; the next save compares against it */
      }
    } finally {
      setSaving(false);
    }
  }

  async function archiveVariant(variantId: number) {
    try {
      mergeAdded(await api.archiveVariant(variantId));
      await reload();
    } catch {
      setError('Не вдалося архівувати варіант');
    }
  }

  function runConfirm(c: Confirm) {
    setConfirm(null);
    if (c.kind === 'leave') navigate(c.href);
    else if (c.kind === 'discard') {
      if (snapshot) setDraft(snapshot);
      setRowErrors({});
      setError(null);
    } else void archiveVariant(c.id);
  }

  // A boutique is not asked what a composite is, nor for a dish's words — but a
  // card that already HAS them keeps them on screen (a store that changed its
  // vertical, a florist's bouquet): hiding existing data is not cleaning up.
  const scope = productFormScope(vertical);
  const showShape = scope.canComposite || (snapshot?.shape ?? '') !== '';
  const showDishFacts =
    scope.askDishFacts || !!snapshot?.composition || (snapshot?.allergens.length ?? 0) > 0;
  const useMatrix = draft ? supportsMatrix(vertical.attributes) && draft.shape === '' : false;
  const backTo = `/admin/products${listSearch}`;
  const titleRef = useRef<string>('');
  if (snapshot) titleRef.current = snapshot.name;

  if (notFound) {
    return (
      <div className="animate-fade-up text-sq-text">
        <PageHeader glyph={Package} title="Такого товару немає" back={{ to: backTo, label: 'Товари' }} />
        <p className="text-[15px] text-sq-secondary">
          Картку могли архівувати, або посилання застаріло.{' '}
          <Link to={backTo} className="sq-link">
            До списку товарів
          </Link>
        </p>
      </div>
    );
  }

  const sheetVariant = sheet != null ? draft?.variants.find((v) => v.id === sheet) : undefined;

  return (
    <div className="animate-fade-up text-sq-text">
      <PageHeader
        glyph={Package}
        title={titleRef.current || 'Товар'}
        back={{ to: backTo, label: 'Товари' }}
      />

      {flash && (
        <div className="mb-5 rounded-sq bg-amber-50 text-amber-800 px-4 py-3 text-sm" role="status">
          {flash}
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      )}

      {!draft ? (
        <p className="text-[15px] text-sq-muted">Завантаження…</p>
      ) : (
        <form onSubmit={(e) => void save(e)}>
          <fieldset disabled={saving} className="min-w-0 p-0 m-0 border-0">
            <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-x-10 gap-y-8 items-start">
              <div className="min-w-0 space-y-8">
                <section className="space-y-4">
                  <SectionHead title="Основне" />
                  <ProductFields
                    value={draft}
                    onPatch={patchDraft}
                    showShape={showShape}
                    showDishFacts={showDishFacts}
                  />
                </section>
                <VariantsSection
                  variants={draft.variants}
                  derived={draft.shape === 'derived'}
                  composite={draft.shape !== ''}
                  rowErrors={rowErrors}
                  onPatch={patchVariant}
                  onOpen={setSheet}
                  onAdd={() => setAdding(true)}
                  addLabel={useMatrix ? 'Додати варіанти' : 'Додати варіант'}
                />
              </div>
              <ProductSide
                value={draft}
                onPatch={patchDraft}
                flatTags={flatTags}
                groups={groups}
                techCards={techCards}
                variants={draft.variants}
              />
            </div>
          </fieldset>

          <div className="sticky bottom-0 z-10 mt-10 -mx-5 md:-mx-12 px-5 md:px-12 py-3 bg-sq-bg/95 backdrop-blur border-t border-sq-divider flex items-center gap-3">
            <span role="status" aria-live="polite" className="text-[15px] text-sq-secondary">
              {saved ? 'Збережено' : dirty ? 'Зміни не збережено' : ''}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {dirty && (
                <button type="button" onClick={() => setConfirm({ kind: 'discard' })} className="sq-btn-quiet">
                  Скасувати
                </button>
              )}
              <button
                type="submit"
                disabled={!dirty || saving}
                className="pos-btn-primary min-h-11 px-6 rounded-sq text-[15px] disabled:opacity-50"
              >
                {saving ? 'Збереження…' : 'Зберегти'}
              </button>
            </div>
          </div>
        </form>
      )}

      {sheetVariant && draft && (
        <VariantSheet
          key={sheetVariant.id}
          variant={sheetVariant}
          shape={draft.shape}
          vertical={vertical}
          colours={colours}
          partOptions={partOptions}
          techCard={techCards.get(sheetVariant.id)}
          onApply={(next) => {
            patchVariant(next.id, next);
            setSheet(null);
          }}
          onArchive={(next) => {
            patchVariant(next.id, next);
            setSheet(null);
            setConfirm({ kind: 'archiveVariant', id: next.id });
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {adding && draft && (
        <AddVariantsDialog
          productId={productId}
          vertical={vertical}
          colours={colours}
          existing={draft.variants}
          shape={draft.shape}
          partOptions={partOptions}
          onAdded={(updated) => {
            mergeAdded(updated);
            setAdding(false);
            void reload();
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {confirm &&
        createPortal(
          confirm.kind === 'leave' ? (
            <ConfirmSheet
              title="Піти без збереження?"
              message="Зміни на картці не збережено."
              confirmLabel="Піти"
              tone="danger"
              onConfirm={() => runConfirm(confirm)}
              onCancel={() => setConfirm(null)}
            />
          ) : confirm.kind === 'discard' ? (
            <ConfirmSheet
              title="Скасувати зміни?"
              message="Картка повернеться до збереженого."
              confirmLabel="Скасувати зміни"
              tone="danger"
              onConfirm={() => runConfirm(confirm)}
              onCancel={() => setConfirm(null)}
            />
          ) : (
            <ConfirmSheet
              title="Архівувати варіант?"
              message="Зникне з каси. Історія продажів збережеться."
              confirmLabel="Архівувати"
              tone="danger"
              onConfirm={() => runConfirm(confirm)}
              onCancel={() => setConfirm(null)}
            />
          ),
          document.body
        )}
    </div>
  );
}
