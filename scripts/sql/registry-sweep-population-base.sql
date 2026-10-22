-- registry-sweep population, Base: the same two roles as
-- registry-sweep-population.sql, read from the blackfriars Base Sieve, which
-- holds the decoded Aave V3 Base events (aave_v3_supply_base,
-- aave_v3_withdraw_base, one aave_v3_atoken_bt_<token>_base BalanceTransfer
-- table per aToken). The plumbing table and the position owners
-- (aave_v3_base_accounts) live in postgres-api, so those exclusions are a
-- second read, registry-sweep-exclusions-base.sql, over this output.
--
--   ~/.claude/bin/victoria-ops.sh psql-read-base < scripts/sql/registry-sweep-population-base.sql > base.txt
--   grep ',counterparty,' base.txt | cut -d, -f2 | sed "s/.*/('&')/" | paste -sd, - > candidates.txt
--   sed -e '/^--CANDIDATES$/r candidates.txt' -e '/^--CANDIDATES$/d' scripts/sql/registry-sweep-exclusions-base.sql \
--     | ~/.claude/bin/victoria-ops.sh psql-read > base-exclude.txt
--   node scripts/registry-sweep.mjs population population.csv api.txt base.txt base-exclude.txt
--
-- A new aToken listed on Base needs its BalanceTransfer table added below.
\pset format unaligned
\pset fieldsep ','
\pset footer off
\pset tuples_only on
with c as (
  select lower("user") a, lower(on_behalf_of) u from aave_v3_supply_base where lower("user") <> lower(on_behalf_of)
  union all
  select lower("to"), lower("user") from aave_v3_withdraw_base where lower("to") <> lower("user")
)
select 8453, a, 'caller', count(*), count(distinct u) from c group by a having count(*) >= 10;
with t as (
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_aave_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_cbbtc_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_cbeth_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_eurc_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_ezeth_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_gho_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_lbtc_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_syrupusdc_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_tbtc_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_usdbc_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_usdc_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_weeth_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_weth_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_wrseth_base
  union all
  select lower("from") f, lower("to") o from aave_v3_atoken_bt_wsteth_base
),
s as (select f a, o other from t union all select o, f from t)
select 8453, a, 'counterparty', count(*), count(distinct other) from s
where a <> '0x0000000000000000000000000000000000000000'
group by a having count(*) >= 10;
