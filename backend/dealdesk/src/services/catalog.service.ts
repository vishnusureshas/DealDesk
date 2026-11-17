import { Customer, type CustomerAttrs } from '../models/Customer';
import { Product, type ProductAttrs } from '../models/Product';
import { paginateQuery, parsePagination } from '../utils/pagination';

export function listCustomers(query: Record<string, unknown>) {
  const { limit, cursor } = parsePagination(query);

  return paginateQuery<CustomerAttrs>(Customer, {}, {
    limit,
    cursor,
    sort: { _id: -1 },
  });
}

export function listProducts(query: Record<string, unknown>) {
  const { limit, cursor } = parsePagination(query);

  return paginateQuery<ProductAttrs>(Product, {}, {
    limit,
    cursor,
    sort: { _id: -1 },
  });
}
