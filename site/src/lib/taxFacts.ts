// The figures every tax article on the site reads from one place, so that
// 1 January changes one line here rather than a copy in each article
// (TechDocs/GROCERY_SEO_AEO.md, «Що оновлювати щороку»). Read in the budget
// law on the day the figure is written; bump the articles' `updatedAt` with it.

/** Мінімальна зарплата з 1 січня 2026 року — Закон № 4695-IX «Про Державний бюджет України на 2026 рік», ст. 8. */
export const MIN_WAGE_2026 = 8647;

/** A single-tax group's yearly income limit, in hryvnias, from its count of minimum wages (ПКУ, п. 291.4): «1 444 049» — grouped by hand with no-break spaces, so the prerender and the browser agree whatever their ICU. */
export const wagesLimit = (wages: number) => String(wages * MIN_WAGE_2026).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
