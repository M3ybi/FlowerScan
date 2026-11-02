import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { clampPage } from "../hooks/usePagination";
import type { createTranslator } from "../lib/i18n";

type Props = {
  page: number;
  pageCount: number;
  setPage: Dispatch<SetStateAction<number>>;
  t: ReturnType<typeof createTranslator>;
};

export const PlantPagination = ({ page, pageCount, setPage, t }: Props) => {
  if (pageCount <= 1) return null;
  const currentPage = clampPage(page, pageCount);
  const move = (offset: number) => setPage(current => clampPage(clampPage(current, pageCount) + offset, pageCount));
  return (
    <nav className="plant-pagination" aria-label={t("pagination.label")}>
      <button type="button" disabled={currentPage === 1} onClick={() => setPage(1)} aria-label={t("pagination.first")}>
        <ChevronsLeft size={20} aria-hidden="true" />
      </button>
      <button type="button" disabled={currentPage === 1} onClick={() => move(-1)} aria-label={t("pagination.previous")}>
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <span role="status" aria-live="polite" aria-atomic="true" aria-label={t("pagination.status", { page: currentPage, total: pageCount })}>
        {t("pagination.indicator", { page: currentPage, total: pageCount })}
      </span>
      <button type="button" disabled={currentPage === pageCount} onClick={() => move(1)} aria-label={t("pagination.next")}>
        <ChevronRight size={20} aria-hidden="true" />
      </button>
      <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(pageCount)} aria-label={t("pagination.last")}>
        <ChevronsRight size={20} aria-hidden="true" />
      </button>
    </nav>
  );
};
