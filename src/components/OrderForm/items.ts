import { formatMinorToInput } from '../../utils/format'
import type { Order } from '../../types/order'

// Item row as entered in the form. Numeric fields are kept as strings while
// editing (controlled inputs) and parsed into the stored model on submit.
export interface ItemInput {
  id: number // stable React key, independent of array position
  name: string
  quantity: string
  price: string // rubles, e.g. "149,90"
}

// Quantity starts empty (not "1") so the field reads as blank; a blank quantity
// is treated as 1 both in the live total and when the order is saved.
export const emptyItem = (id: number): ItemInput => ({ id, name: '', quantity: '', price: '' })

// Build the editable item rows for the initial state: one blank row when
// creating, or the stored plants converted back to input strings when editing /
// repeating. Row ids are the array index, so the id ref continues from there for
// rows added later.
export const initialItems = (order: Order | undefined): ItemInput[] =>
  order
    ? order.plants.map((p, id) => ({
        id,
        name: p.name,
        quantity: String(p.quantity),
        price: formatMinorToInput(p.unitPriceMinor),
      }))
    : [emptyItem(0)]
