import { qtySchema, vnParts, type IngredientListItem } from '@bot-op/shared';
import { useCallback, useSyncExternalStore } from 'react';
import { useMe } from '../auth/queries';

type SupplierRef = { id: string; name: string };

export type CartLine = {
  ingredientId: string;
  code: string;
  name: string;
  unit: string;
  /** The ingredient's default supplier. */
  supplierId: string | null;
  supplierName: string | null;
  alternateSuppliers: SupplierRef[];
  /** Set when this line is bought elsewhere (e.g. small quantity → market). */
  chosenSupplier: SupplierRef | null;
  /** Latest price from the default supplier, for the estimate only (the server snapshots its own). */
  unitPrice: number | null;
  /** As typed: "2,5" is fine; validated on submit. */
  qty: string;
  /** Per-item note sent to the supplier, e.g. "lấy củ nhỏ". */
  note: string;
};

export type Cart = {
  lines: Record<string, CartLine>;
  note: string;
  neededDate: string;
};

/** The supplier this line will be ordered from. */
export const lineSupplier = (l: CartLine): SupplierRef | null =>
  l.chosenSupplier ??
  (l.supplierId && l.supplierName ? { id: l.supplierId, name: l.supplierName } : null);

/** The default supplier's price only applies when the line is not moved to another supplier. */
export const linePrice = (l: CartLine) => (l.chosenSupplier ? null : l.unitPrice);

export const todayVn = () => {
  const p = vnParts(new Date());
  return `${p.year}-${p.month}-${p.day}`;
};

const emptyCart = (): Cart => ({ lines: {}, note: '', neededDate: todayVn() });

// Per-user cart in localStorage so a flaky connection or a closed tab does not lose it.
const listeners = new Set<() => void>();
const cache = new Map<string, Cart>();
const storageKey = (userId: string) => `botop.cart.${userId}`;

function read(userId: string): Cart {
  const cached = cache.get(userId);
  if (cached) return cached;
  let cart = emptyCart();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) cart = { ...cart, ...(JSON.parse(raw) as Partial<Cart>) };
  } catch {
    // Storage unavailable or corrupt: start empty.
  }
  // Carts saved by an older version lack the newer fields.
  cart.lines = Object.fromEntries(
    Object.entries(cart.lines).map(([id, l]) => [
      id,
      {
        ...l,
        alternateSuppliers: l.alternateSuppliers ?? [],
        chosenSupplier: l.chosenSupplier ?? null,
        note: l.note ?? '',
      },
    ]),
  );
  // An old cart should not silently order for a past date.
  if (cart.neededDate < todayVn()) cart.neededDate = todayVn();
  cache.set(userId, cart);
  return cart;
}

function write(userId: string, cart: Cart) {
  cache.set(userId, cart);
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(cart));
  } catch {
    // Quota or private mode: the in-memory cart still works for this session.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** "2,5" → "2.5" if valid, else null. */
export const normalizeQty = (qty: string) => {
  const r = qtySchema.safeParse(qty);
  return r.success ? r.data : null;
};

function fromIngredient(
  item: IngredientListItem,
  existing: CartLine | undefined,
  qty: string,
): CartLine {
  const sameSupplierPrice =
    item.latestPrice &&
    item.defaultSupplier &&
    item.latestPrice.supplierId === item.defaultSupplier.id
      ? item.latestPrice.unitPrice
      : null;
  return {
    ingredientId: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    supplierId: item.defaultSupplier?.id ?? null,
    supplierName: item.defaultSupplier?.name ?? null,
    alternateSuppliers: item.alternateSuppliers,
    unitPrice: sameSupplierPrice,
    qty,
    // Changing the quantity from the list keeps choices made in the cart.
    chosenSupplier: existing?.chosenSupplier ?? null,
    note: existing?.note ?? '',
  };
}

export function useCart() {
  const { data: me } = useMe();
  const userId = me?.id ?? 'anonymous';
  const cart = useSyncExternalStore(subscribe, () => read(userId));

  const update = useCallback((fn: (c: Cart) => Cart) => write(userId, fn(read(userId))), [userId]);

  const updateLine = useCallback(
    (id: string, patch: Partial<CartLine>) =>
      update((c) => {
        const line = c.lines[id];
        return line ? { ...c, lines: { ...c.lines, [id]: { ...line, ...patch } } } : c;
      }),
    [update],
  );

  const setQty = useCallback(
    (item: IngredientListItem | CartLine, qty: string) =>
      update((c) => {
        const lines = { ...c.lines };
        const id = 'ingredientId' in item ? item.ingredientId : item.id;
        if (qty === '' || normalizeQty(qty) === '0') delete lines[id];
        else if ('ingredientId' in item) lines[id] = { ...(lines[id] ?? item), qty };
        else lines[id] = fromIngredient(item, lines[id], qty);
        return { ...c, lines };
      }),
    [update],
  );

  return {
    cart,
    lines: Object.values(cart.lines),
    setQty,
    /** null = back to the default supplier. */
    setLineSupplier: (id: string, supplier: SupplierRef | null) => {
      const line = cart.lines[id];
      updateLine(id, {
        chosenSupplier: supplier && supplier.id !== line?.supplierId ? supplier : null,
      });
    },
    setLineNote: (id: string, note: string) => updateLine(id, { note }),
    setNote: (note: string) => update((c) => ({ ...c, note })),
    setNeededDate: (neededDate: string) => update((c) => ({ ...c, neededDate })),
    clear: () => update(() => emptyCart()),
  };
}
