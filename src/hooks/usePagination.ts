import { useEffect, useState } from "react";

export const pageCountForItems = (itemCount: number, pageSize: number) => Math.max(1, Math.ceil(itemCount / pageSize));
export const clampPage = (page: number, pageCount: number) => Math.max(1, Math.min(page, pageCount));

export const usePagination = (itemCount: number, pageSize: number) => {
  const [requestedPage, setPage] = useState(1);
  const pageCount = pageCountForItems(itemCount, pageSize);
  const page = clampPage(requestedPage, pageCount);
  // Clamp for this render and commit the correction so a later addition cannot
  // restore an obsolete page. Valid pages survive searches and collection edits.
  useEffect(() => { setPage(current => clampPage(current, pageCount)); }, [pageCount]);
  return { page, pageCount, setPage };
};
