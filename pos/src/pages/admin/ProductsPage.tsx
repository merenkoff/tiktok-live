import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { formatUah, uahInputToCents } from '../../lib/money';
import type { PosTag, Product, ProductVariant } from '../../types';
import { ProductPhotoField } from '../../components/ProductPhotoField';
import { TagColorSwatches } from '../../components/TagColorSwatches';
import { assetUrl } from '../../lib/urls';
import { DEFAULT_TAG_COLOR, type TagColorKey } from '../../lib/tagColors';

function flattenTags(tags: PosTag[]): PosTag[] {
  const out: PosTag[] = [];
  for (const t of tags) {
    out.push(t);
    if (t.children) out.push(...t.children);
  }
  return out;
}

const fieldClass =
  'rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sm text-sq-text w-full';

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<PosTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<number | 'all' | 'needs_review'>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagParent, setNewTagParent] = useState<number | ''>('');
  const [newTagColor, setNewTagColor] = useState<TagColorKey>(DEFAULT_TAG_COLOR);
  const [newTagCatalogBar, setNewTagCatalogBar] = useState(false);
  const [bulkTagId, setBulkTagId] = useState<number | ''>('');
  const [savingTagId, setSavingTagId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [size, setSize] = useState('M');
  const [color, setColor] = useState('');
  const [price, setPrice] = useState('690');
  const [qty, setQty] = useState('1');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const flatTags = useMemo(() => flattenTags(tags), [tags]);

  async function reload() {
    const [plist, tlist] = await Promise.all([api.getProducts(), api.getTags()]);
    setProducts(plist);
    setTags(tlist);
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити'));
  }, []);

  const visible = products.filter((p) => {
    if (!p.is_active) return false;
    if (filterTag === 'needs_review') return Boolean(p.needs_review);
    if (filterTag === 'all') return true;
    return p.tag_ids?.includes(filterTag);
  });

  const needsReviewCount = products.filter((p) => p.is_active && p.needs_review).length;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createProduct({
        name,
        image_url: imageUrl,
        variants: [
          {
            size,
            color,
            sku: sku || undefined,
            barcode: barcode || undefined,
            price_cents: uahInputToCents(price),
            quantity: Number(qty) || 0,
          },
        ],
      });
      setShowCreate(false);
      setName('');
      setBarcode('');
      setSku('');
      setImageUrl(null);
      await reload();
    } catch {
      setError('Не вдалося створити товар');
    }
  }

  async function onCreateTag(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createTag({
        name: newTagName,
        parent_id: newTagParent === '' ? null : Number(newTagParent),
        color: newTagColor,
        show_in_catalog_bar: newTagCatalogBar,
      });
      setNewTagName('');
      setNewTagParent('');
      setNewTagColor(DEFAULT_TAG_COLOR);
      setNewTagCatalogBar(false);
      await reload();
    } catch {
      setError('Не вдалося створити мітку (макс. 2 рівні)');
    }
  }

  async function patchTag(
    tag: PosTag,
    patch: { color?: string | null; show_in_catalog_bar?: boolean }
  ) {
    setSavingTagId(tag.id);
    setError(null);
    try {
      await api.updateTag(tag.id, patch);
      await reload();
    } catch {
      setError('Не вдалося оновити мітку');
    } finally {
      setSavingTagId(null);
    }
  }

  async function onBulkAssign() {
    if (bulkTagId === '' || selected.size === 0) return;
    try {
      await api.assignTag(Number(bulkTagId), [...selected]);
      setSelected(new Set());
      await reload();
    } catch {
      setError('Не вдалося призначити мітку');
    }
  }

  async function onArchiveProduct(p: Product) {
    if (
      !confirm(
        `Архівувати «${p.name}»? Зникне з каси, історія продажів збережеться.`
      )
    ) {
      return;
    }
    await api.archiveProduct(p.id);
    if (editId === p.id) setEditId(null);
    await reload();
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Товари</h2>
          <p className="text-sm text-sq-secondary mt-1">Мітки, варіанти та залишки.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setEditId(null);
          }}
          className="sq-btn-primary px-4 py-2.5 text-sm"
        >
          {showCreate ? 'Сховати' : 'Додати товар'}
        </button>
      </div>

      {error && (
        <div className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}

      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        <section className="border border-sq-divider rounded-sq bg-sq-surface p-4 space-y-3 shadow-sm">
          <p className="sq-section-label">Мітки</p>
          <button
            type="button"
            onClick={() => setFilterTag('all')}
            className={`w-full text-left px-3 py-2 rounded-[4px] text-sm font-medium ${
              filterTag === 'all' ? 'sq-nav-active' : 'sq-nav-idle'
            }`}
          >
            Усі товари
          </button>
          <button
            type="button"
            onClick={() => setFilterTag('needs_review')}
            className={`w-full text-left px-3 py-2 rounded-[4px] text-sm font-medium ${
              filterTag === 'needs_review' ? 'sq-nav-active' : 'sq-nav-idle'
            }`}
          >
            З приходу — перевірте
            {needsReviewCount > 0 ? ` (${needsReviewCount})` : ''}
          </button>
          {tags.map((root) => (
            <div key={root.id} className="space-y-1">
              <TagAdminRow
                tag={root}
                active={filterTag === root.id}
                saving={savingTagId === root.id}
                onFilter={() => setFilterTag(root.id)}
                onColor={(color) => void patchTag(root, { color })}
                onCatalogBar={(show_in_catalog_bar) =>
                  void patchTag(root, { show_in_catalog_bar })
                }
              />
              <div className="ml-3 space-y-1">
                {(root.children ?? []).map((child) => (
                  <TagAdminRow
                    key={child.id}
                    tag={child}
                    nested
                    active={filterTag === child.id}
                    saving={savingTagId === child.id}
                    onFilter={() => setFilterTag(child.id)}
                    onColor={(color) => void patchTag(child, { color })}
                    onCatalogBar={(show_in_catalog_bar) =>
                      void patchTag(child, { show_in_catalog_bar })
                    }
                  />
                ))}
              </div>
            </div>
          ))}

          <form onSubmit={onCreateTag} className="pt-3 border-t border-sq-divider space-y-2">
            <p className="text-xs font-semibold text-sq-secondary">Нова мітка</p>
            <input
              className={fieldClass}
              placeholder="Назва"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              required
            />
            <select
              className={fieldClass}
              value={newTagParent}
              onChange={(e) => setNewTagParent(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Корінь</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  під «{t.name}»
                </option>
              ))}
            </select>
            <div className="space-y-1">
              <p className="text-[11px] text-sq-secondary">Колір плитки</p>
              <TagColorSwatches value={newTagColor} onChange={setNewTagColor} size="sm" />
            </div>
            <label className="flex items-start gap-2 text-sm text-sq-text cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={newTagCatalogBar}
                onChange={(e) => setNewTagCatalogBar(e.target.checked)}
              />
              <span>
                Показувати в рядку категорій
                <span className="block text-[11px] text-sq-secondary">Рядок категорій на касі</span>
              </span>
            </label>
            <button type="submit" className="sq-btn-primary w-full py-2.5 text-sm">
              Додати мітку
            </button>
          </form>
        </section>

        <div className="space-y-4">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border border-sq-divider rounded-sq p-3 bg-sq-bg">
              <span className="text-sm text-sq-secondary">Обрано: {selected.size}</span>
              <select
                className="rounded-sq border border-sq-divider px-3 py-2 text-sm"
                value={bulkTagId}
                onChange={(e) => setBulkTagId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">Мітка…</option>
                {flatTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.parent_id ? `↳ ${t.name}` : t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void onBulkAssign()}
                className="sq-btn-primary px-3 py-2 text-sm"
              >
                Додати мітку
              </button>
            </div>
          )}

          {showCreate && (
            <form
              onSubmit={onCreate}
              className="border border-sq-divider rounded-sq p-4 grid sm:grid-cols-2 gap-3 bg-sq-surface shadow-sm"
            >
              <p className="sm:col-span-2 text-sm font-semibold text-sq-text">Новий товар</p>
              <ProductPhotoField value={imageUrl} onChange={setImageUrl} />
              <input className={fieldClass} placeholder="Назва" value={name} onChange={(e) => setName(e.target.value)} required />
              <input className={fieldClass} placeholder="Колір" value={color} onChange={(e) => setColor(e.target.value)} />
              <input className={fieldClass} placeholder="Розмір" value={size} onChange={(e) => setSize(e.target.value)} />
              <input className={fieldClass} placeholder="Ціна, грн" value={price} onChange={(e) => setPrice(e.target.value)} />
              <input className={fieldClass} placeholder="Залишок" value={qty} onChange={(e) => setQty(e.target.value)} />
              <input className={fieldClass} placeholder="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
              <input className={`${fieldClass} sm:col-span-2`} placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
              <button type="submit" className="sq-btn-primary sm:col-span-2 py-2.5 text-sm">
                Зберегти
              </button>
            </form>
          )}

          <div className="space-y-3">
            {visible.map((product) =>
              editId === product.id ? (
                <EditProductInline
                  key={product.id}
                  product={product}
                  tags={tags}
                  flatTags={flatTags}
                  onCancel={() => setEditId(null)}
                  onSaved={async () => {
                    await reload();
                  }}
                  onCloseAfterSave={() => setEditId(null)}
                />
              ) : (
                <section
                  key={product.id}
                  className="border border-sq-divider rounded-sq p-4 bg-sq-surface shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-sq border border-sq-divider bg-sq-bg overflow-hidden shrink-0 grid place-items-center">
                            {product.image_url ? (
                              <img
                                src={assetUrl(product.image_url) ?? undefined}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[10px] text-sq-muted">фото</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-sq-text truncate">{product.name}</h3>
                              {product.needs_review && (
                                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-[#FFF4E5] text-[#B54708]">
                                  Потребує перевірки
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3 text-sm font-semibold">
                          <button
                            type="button"
                            className="text-sq-blue"
                            onClick={() => {
                              setShowCreate(false);
                              setEditId(product.id);
                            }}
                          >
                            Редагувати
                          </button>
                          <button
                            type="button"
                            className="text-red-600"
                            onClick={() => void onArchiveProduct(product)}
                          >
                            Архів
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(product.tag_ids ?? []).map((tid) => {
                          const tag = flatTags.find((t) => t.id === tid);
                          return (
                            <span
                              key={tid}
                              className="text-xs px-2 py-0.5 rounded-full bg-sq-bg text-sq-secondary border border-sq-divider"
                            >
                              {tag?.name ?? tid}
                            </span>
                          );
                        })}
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-sq-secondary">
                              <th className="py-1 pr-2 font-medium">Варіант</th>
                              <th className="py-1 pr-2 font-medium">Ціна</th>
                              <th className="py-1 pr-2 font-medium">Залишок</th>
                              <th className="py-1 font-medium">Barcode</th>
                            </tr>
                          </thead>
                          <tbody>
                            {product.variants
                              .filter((v) => v.is_active)
                              .map((v) => (
                                <tr key={v.id} className="border-t border-sq-divider">
                                  <td className="py-2 pr-2">
                                    {[v.color, v.size].filter(Boolean).join(' / ') || '—'}
                                  </td>
                                  <td className="py-2 pr-2">{formatUah(v.price_cents)}</td>
                                  <td className="py-2 pr-2">{v.quantity}</td>
                                  <td className="py-2 font-mono text-xs">{v.barcode || '—'}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </section>
              )
            )}
            {visible.length === 0 && (
              <p className="text-sm text-sq-secondary">Немає товарів у цьому фільтрі.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TagAdminRow({
  tag,
  nested,
  active,
  saving,
  onFilter,
  onColor,
  onCatalogBar,
}: {
  tag: PosTag;
  nested?: boolean;
  active: boolean;
  saving: boolean;
  onFilter: () => void;
  onColor: (color: TagColorKey) => void;
  onCatalogBar: (value: boolean) => void;
}) {
  return (
    <div
      className={`rounded-[4px] border border-transparent p-1.5 space-y-1.5 ${
        active ? 'bg-sq-blue/10 border-sq-blue/30' : ''
      } ${saving ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        onClick={onFilter}
        className={`w-full text-left px-2 py-1 rounded-[4px] font-medium ${
          nested ? 'text-sm text-[#6E6E6E]' : 'text-sm'
        } ${active ? 'text-sq-blue' : 'text-sq-text'}`}
      >
        {tag.name}
        {tag.show_in_catalog_bar && (
          <span className="ml-1.5 text-[10px] font-normal text-sq-blue">рядок</span>
        )}
      </button>
      <TagColorSwatches
        value={tag.color}
        onChange={onColor}
        size="sm"
      />
      <label className="flex items-center gap-1.5 px-1 text-[11px] text-sq-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={tag.show_in_catalog_bar}
          disabled={saving}
          onChange={(e) => onCatalogBar(e.target.checked)}
        />
        У рядку категорій
      </label>
    </div>
  );
}

function EditProductInline({
  product,
  tags,
  flatTags,
  onCancel,
  onSaved,
  onCloseAfterSave,
}: {
  product: Product;
  tags: PosTag[];
  flatTags: PosTag[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onCloseAfterSave: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(product.image_url);
  const [tagIds, setTagIds] = useState<number[]>(product.tag_ids ?? []);
  const [variants, setVariants] = useState<ProductVariant[]>(
    product.variants.filter((v) => v.is_active)
  );
  const [newSize, setNewSize] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newPrice, setNewPrice] = useState('690');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleTag(id: number) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.updateProduct(product.id, { name, description, image_url: imageUrl });
      await api.setProductTags(product.id, tagIds);
      for (const v of variants) {
        await api.updateVariant(v.id, {
          size: v.size,
          color: v.color,
          price_cents: v.price_cents,
          compare_at_cents: v.compare_at_cents ?? null,
          sku: v.sku ?? '',
          barcode: v.barcode ?? '',
        });
      }
      await onSaved();
      onCloseAfterSave();
    } catch {
      setError('Не вдалося зберегти');
    } finally {
      setSaving(false);
    }
  }

  async function addVariant() {
    try {
      const updated = await api.addVariant(product.id, {
        size: newSize,
        color: newColor,
        price_cents: uahInputToCents(newPrice),
        quantity: 0,
      });
      setVariants(updated.variants.filter((v) => v.is_active));
      setNewSize('');
      setNewColor('');
      setNewPrice('690');
      await onSaved();
    } catch {
      setError('Не вдалося додати варіант');
    }
  }

  async function archiveVariant(id: number) {
    if (!confirm('Архівувати варіант? Зникне з каси.')) return;
    const updated = await api.archiveVariant(id);
    setVariants(updated.variants.filter((v) => v.is_active));
    await onSaved();
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="border border-sq-blue/40 rounded-sq p-4 grid sm:grid-cols-2 gap-3 bg-sq-surface shadow-sm"
    >
      <div className="sm:col-span-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-sq-text">Редагування</p>
        <button type="button" className="text-sm text-sq-secondary font-medium" onClick={onCancel}>
          Сховати
        </button>
      </div>

      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}

      <ProductPhotoField value={imageUrl} onChange={setImageUrl} />

      <input
        className={fieldClass}
        placeholder="Назва"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className={fieldClass}
        placeholder="Опис"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="sm:col-span-2">
        <p className="text-xs font-semibold text-sq-secondary mb-2">Мітки</p>
        <div className="flex flex-wrap gap-2">
          {flatTags.map((t) => (
            <label
              key={t.id}
              className="inline-flex items-center gap-1.5 text-sm border border-sq-divider rounded-full px-2.5 py-1 bg-sq-bg"
            >
              <input
                type="checkbox"
                checked={tagIds.includes(t.id)}
                onChange={() => toggleTag(t.id)}
              />
              {t.parent_id ? `${tags.find((r) => r.id === t.parent_id)?.name} / ` : ''}
              {t.name}
            </label>
          ))}
          {flatTags.length === 0 && (
            <span className="text-sm text-sq-muted">Немає міток</span>
          )}
        </div>
      </div>

      <div className="sm:col-span-2 space-y-3">
        <p className="text-xs font-semibold text-sq-secondary">Варіанти</p>
        {variants.map((v, idx) => (
          <div key={v.id} className="border border-sq-divider rounded-sq p-3 space-y-2 bg-sq-bg/40">
            <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <input
                className={fieldClass}
                value={v.color}
                onChange={(e) => {
                  const next = [...variants];
                  next[idx] = { ...v, color: e.target.value };
                  setVariants(next);
                }}
                placeholder="Колір"
              />
              <input
                className={fieldClass}
                value={v.size}
                onChange={(e) => {
                  const next = [...variants];
                  next[idx] = { ...v, size: e.target.value };
                  setVariants(next);
                }}
                placeholder="Розмір"
              />
              <input
                className={fieldClass}
                value={(v.price_cents / 100).toFixed(2)}
                onChange={(e) => {
                  const next = [...variants];
                  next[idx] = { ...v, price_cents: uahInputToCents(e.target.value) };
                  setVariants(next);
                }}
                placeholder="Ціна, грн"
              />
              <button
                type="button"
                className="text-sm font-semibold text-red-600 min-h-11 px-2"
                onClick={() => void archiveVariant(v.id)}
              >
                Архів
              </button>
            </div>
            <VariantDiscountEditor
              priceCents={v.price_cents}
              compareAtCents={v.compare_at_cents ?? null}
              onChange={(price_cents, compare_at_cents) => {
                const next = [...variants];
                next[idx] = { ...v, price_cents, compare_at_cents };
                setVariants(next);
              }}
            />
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                className={fieldClass}
                value={v.barcode ?? ''}
                onChange={(e) => {
                  const next = [...variants];
                  next[idx] = { ...v, barcode: e.target.value };
                  setVariants(next);
                }}
                placeholder="Barcode"
              />
              <input
                className={fieldClass}
                value={v.sku ?? ''}
                onChange={(e) => {
                  const next = [...variants];
                  next[idx] = { ...v, sku: e.target.value };
                  setVariants(next);
                }}
                placeholder="SKU"
              />
            </div>
          </div>
        ))}

        <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center pt-1">
          <input
            className={fieldClass}
            placeholder="Колір"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
          />
          <input
            className={fieldClass}
            placeholder="Розмір"
            value={newSize}
            onChange={(e) => setNewSize(e.target.value)}
          />
          <input
            className={fieldClass}
            placeholder="Ціна, грн"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />
          <button
            type="button"
            className="text-sm font-semibold text-sq-blue min-h-11 px-2"
            onClick={() => void addVariant()}
          >
            + Варіант
          </button>
        </div>
      </div>

      <button type="submit" disabled={saving} className="sq-btn-primary sm:col-span-2 py-2.5 text-sm">
        {saving ? 'Збереження…' : 'Зберегти'}
      </button>
    </form>
  );
}

function VariantDiscountEditor({
  priceCents,
  compareAtCents,
  onChange,
}: {
  priceCents: number;
  compareAtCents: number | null;
  onChange: (priceCents: number, compareAtCents: number | null) => void;
}) {
  const [pct, setPct] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const hasDiscount = compareAtCents != null && compareAtCents > priceCents;

  return (
    <div className="space-y-1.5 text-sm">
      <p className="text-[11px] font-semibold text-sq-secondary">Знижка товару</p>
      {hasDiscount ? (
        <p className="text-xs text-sq-secondary">
          Стара: {(compareAtCents / 100).toFixed(2)} ₴ → нова: {(priceCents / 100).toFixed(2)} ₴
          <button
            type="button"
            className="ml-2 text-sq-blue font-medium"
            onClick={() => onChange(compareAtCents, null)}
          >
            Скинути знижку
          </button>
        </p>
      ) : (
        <p className="text-xs text-sq-muted">Без знижки</p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className={`${fieldClass} max-w-[100px]`}
          placeholder="% знижки"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
        <button
          type="button"
          className="text-xs font-semibold text-sq-blue px-2 py-1"
          onClick={() => {
            const p = Number(pct);
            if (!Number.isFinite(p) || p <= 0 || p >= 100) return;
            const base = compareAtCents ?? priceCents;
            const nextPrice = Math.round((base * (100 - p)) / 100);
            onChange(nextPrice, base);
            setPct('');
          }}
        >
          За % 
        </button>
        <input
          className={`${fieldClass} max-w-[120px]`}
          placeholder="Нова ціна, грн"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
        />
        <button
          type="button"
          className="text-xs font-semibold text-sq-blue px-2 py-1"
          onClick={() => {
            const next = uahInputToCents(newPrice);
            if (next <= 0 || next >= priceCents) return;
            const base = compareAtCents ?? priceCents;
            onChange(next, base);
            setNewPrice('');
          }}
        >
          За новою ціною
        </button>
      </div>
    </div>
  );
}
