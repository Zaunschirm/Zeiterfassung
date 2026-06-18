-- Atomically books all earned vacation months up to the month before p_as_of.
-- The advisory transaction lock makes concurrent app starts safe even when the
-- accrual table does not yet have a unique constraint.
create or replace function public.apply_monthly_vacation_accruals(
  p_as_of date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_earned_month constant date := date '2026-04-01';
  v_effective_as_of date := least(coalesce(p_as_of, current_date), current_date);
  v_latest_earned_month date := (date_trunc('month', v_effective_as_of)::date - interval '1 month')::date;
  v_employee record;
  v_missing_months date[];
  v_missing_count integer;
  v_delta numeric;
  v_booked_count integer := 0;
begin
  if v_latest_earned_month < v_first_earned_month then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtext('apply_monthly_vacation_accruals'));

  for v_employee in
    select id
    from public.employees
    where coalesce(active, true) = true
      and coalesce(disabled, false) = false
    order by id
  loop
    select
      array_agg(month_value::date order by month_value),
      count(*)::integer
    into v_missing_months, v_missing_count
    from generate_series(
      v_first_earned_month,
      v_latest_earned_month,
      interval '1 month'
    ) as months(month_value)
    where not exists (
      select 1
      from public.vacation_monthly_accruals accrual
      where accrual.employee_id = v_employee.id
        and accrual.accrual_month::date = month_value::date
    );

    if coalesce(v_missing_count, 0) = 0 then
      continue;
    end if;

    v_delta := round((25::numeric / 12) * v_missing_count, 2);

    update public.employees
    set vacation_entitlement_days = round(
      coalesce(vacation_entitlement_days, 0)::numeric + v_delta,
      2
    )
    where id = v_employee.id;

    insert into public.vacation_monthly_accruals (
      employee_id,
      accrual_month,
      days,
      note
    )
    select
      v_employee.id,
      earned_month,
      25::numeric / 12,
      'Automatischer Monatsanspruch Urlaub für ' || to_char(earned_month, 'YYYY-MM') ||
        '; Gutschrift am 01. des Folgemonats'
    from unnest(v_missing_months) as months(earned_month);

    v_booked_count := v_booked_count + v_missing_count;
  end loop;

  return v_booked_count;
end;
$$;

revoke all on function public.apply_monthly_vacation_accruals(date) from public;
grant execute on function public.apply_monthly_vacation_accruals(date) to anon, authenticated;
