const locks = new WeakMap<Document, { owners: Set<symbol>; previous: string }>();

export const lockDialogScroll = (document: Document) => {
  let lock = locks.get(document);
  if (!lock) {
    lock = { owners: new Set(), previous: document.body.style.overflow };
    locks.set(document, lock);
  }
  const owner = Symbol("dialog-scroll-lock");
  lock.owners.add(owner);
  document.body.style.overflow = "hidden";
  return () => {
    if (!lock.owners.delete(owner)) return;
    if (!lock.owners.size) {
      document.body.style.overflow = lock.previous;
      locks.delete(document);
    }
  };
};
