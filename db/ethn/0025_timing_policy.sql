-- Fresh ETHN chain only; existing databases require a separately approved migration plan.
grant update (interval_minutes,minimum_minutes,anchor_minutes,horizon_days,hold_minutes,version) on ethn.settings to ethn_checkout;
