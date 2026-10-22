-- registry-sweep, Base exclusions: of the Base population
-- (registry-sweep-population-base.sql, whose header has the pipeline that
-- fills the list below), the addresses the plumbing table names for Base
-- (every role) and the counterparties that are Aave V3 Base position owners.
\pset format unaligned
\pset footer off
\pset tuples_only on
select 'exclude,8453,' || lower(address) || ',*' from protocol_plumbing_contracts where chain_id = 8453;
with c(a) as (values
--CANDIDATES
)
select 'exclude,8453,' || c.a || ',counterparty' from c
where exists (select 1 from aave_v3_base_accounts b where b.wallet = c.a);
