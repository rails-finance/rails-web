-- registry-sweep population, Ethereum and Arbitrum: the addresses with 10 or
-- more rows on the Aave V3 timelines that the plumbing table does not name.
-- Read by scripts/registry-sweep.mjs (`population` mode); Base is in
-- registry-sweep-population-base.sql. rails-ops TO-DO-ui-jobs 423.
--
--   ~/.claude/bin/victoria-ops.sh psql-read < scripts/sql/registry-sweep-population.sql > api.txt
--
-- Roles, per chain:
--   caller        the Pool caller on a supply (event `user`, against
--                 `onBehalfOf`) or the recipient of a withdrawal (`to`,
--                 against `user`) where it differs from the position, not in
--                 protocol_plumbing_contracts for the chain.
--   counterparty  either side of an aToken BalanceTransfer, not the zero
--                 address, not plumbing, not a position owner on the
--                 chain.
-- Output lines: chain,address,role,rows,positions (distinct positions on the
-- other side).
--
-- Sources: Ethereum aave_v3_supply / aave_v3_withdraw (core, Prime and
-- EtherFi Pools) and aave_family_atoken_transfer joined to
-- aave_family_reserve_tokens on the aave-v3* markets (SparkLend's aTokens share
-- the table and are left out); owners are aave_v3_position_chain. Arbitrum has
-- no decoded event tables: aave_v3_arbitrum_history holds the raw logs of the
-- wallets whose history was read, one copy per wallet, so logs are taken once
-- per (tx_hash, log_index) and decoded here; owners are aave_v3_arbitrum_census.
\pset format unaligned
\pset fieldsep ','
\pset footer off
\pset tuples_only on
-- Ethereum callers
with plumb as (select lower(address) a from protocol_plumbing_contracts where chain_id = 1),
c as (
  select lower(caller) a, lower(user_addr) u from aave_v3_supply where lower(caller) <> lower(user_addr)
  union all
  select lower(caller), lower(user_addr) from aave_v3_withdraw where lower(caller) <> lower(user_addr)
)
select 1, a, 'caller', count(*), count(distinct u)
from c where a not in (select a from plumb) group by a having count(*) >= 10;
-- Ethereum counterparties
with plumb as (select lower(address) a from protocol_plumbing_contracts where chain_id = 1),
owners as (select distinct lower(wallet) a from aave_v3_position_chain),
t as (
  select lower(t.from_addr) f, lower(t.to_addr) o
  from aave_family_atoken_transfer t
  join aave_family_reserve_tokens r on lower(r.atoken) = lower(t.atoken) and r.market like 'aave-v3%'
),
s as (select f a, o other from t union all select o, f from t)
select 1, a, 'counterparty', count(*), count(distinct other) from s
where a <> '0x0000000000000000000000000000000000000000'
  and a not in (select a from plumb) and a not in (select a from owners)
group by a having count(*) >= 10;
-- Arbitrum: raw logs, one copy per (tx_hash, log_index)
with plumb as (select lower(address) a from protocol_plumbing_contracts where chain_id = 42161),
logs as (
  select distinct on (tx_hash, log_index) topic0, topics, data from aave_v3_arbitrum_history
  order by tx_hash, log_index
),
c as (
  select '0x' || substr(data, 27, 40) a, '0x' || substr(topics[3], 27, 40) u from logs
  where topic0 = '0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61'
  union all
  select '0x' || substr(topics[4], 27, 40), '0x' || substr(topics[3], 27, 40) from logs
  where topic0 = '0x3115d1449a7b732c986cba18244e897a450f61e1bb8d589cd2e69e6c8924f9f7'
)
select 42161, lower(a), 'caller', count(*), count(distinct u) from c
where lower(a) <> lower(u) and lower(a) not in (select a from plumb)
group by 2 having count(*) >= 10;
with plumb as (select lower(address) a from protocol_plumbing_contracts where chain_id = 42161),
owners as (select distinct lower(wallet) a from aave_v3_arbitrum_census),
logs as (
  select distinct on (tx_hash, log_index) topic0, topics from aave_v3_arbitrum_history
  where topic0 = '0x4beccb90f994c31aced7a23b5611020728a23d8ec5cddd1a3e9d97b96fda8666'
  order by tx_hash, log_index
),
t as (select lower('0x' || substr(topics[2], 27, 40)) f, lower('0x' || substr(topics[3], 27, 40)) o from logs),
s as (select f a, o other from t union all select o, f from t)
select 42161, a, 'counterparty', count(*), count(distinct other) from s
where a <> '0x0000000000000000000000000000000000000000'
  and a not in (select a from plumb) and a not in (select a from owners)
group by a having count(*) >= 10;
