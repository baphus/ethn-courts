-- Staff read API: narrow additional payment metadata only; booking/item reads already granted by 0002.
grant select (reviewed_at, review_reason) on ethn.payments to ethn_checkout;
