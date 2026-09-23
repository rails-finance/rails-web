-- f(x) V2 spike sample: positions + full event history, as one JSON doc
WITH wsteth_snap AS (
  SELECT position, tick, block_number,
         lead(block_number) OVER (PARTITION BY position ORDER BY block_number, log_index) AS next_bn
  FROM fx_v2_snapshot_wsteth
),
wbtc_snap AS (
  SELECT position, tick, block_number,
         lead(block_number) OVER (PARTITION BY position ORDER BY block_number, log_index) AS next_bn
  FROM fx_v2_snapshot_wbtc
),
tick_hit_wsteth AS (
  SELECT DISTINCT s.position
  FROM wsteth_snap s
  JOIN fx_v2_rebalance_tick rt
    ON rt.pool = '0x6Ecfa38FeE8a5277B91eFdA204c235814F0122E8'
   AND rt.tick = s.tick
   AND rt.block_number > s.block_number
   AND (s.next_bn IS NULL OR rt.block_number < s.next_bn)
  LIMIT 5
),
tick_hit_wbtc AS (
  SELECT DISTINCT s.position
  FROM wbtc_snap s
  JOIN fx_v2_rebalance_tick rt
    ON rt.pool = '0xAB709e26Fa6B0A30c119D8c55B887DeD24952473'
   AND rt.tick = s.tick
   AND rt.block_number > s.block_number
   AND (s.next_bn IS NULL OR rt.block_number < s.next_bn)
  LIMIT 4
),
liq AS (
  SELECT DISTINCT pool, position FROM fx_v2_liquidate LIMIT 5
),
busy AS (
  (SELECT pool, position, count(*) c FROM fx_v2_operate
   WHERE pool = '0x6Ecfa38FeE8a5277B91eFdA204c235814F0122E8'
   GROUP BY pool, position ORDER BY c DESC LIMIT 4)
  UNION ALL
  (SELECT pool, position, count(*) c FROM fx_v2_operate
   WHERE pool = '0xAB709e26Fa6B0A30c119D8c55B887DeD24952473'
   GROUP BY pool, position ORDER BY c DESC LIMIT 3)
),
sample AS (
  SELECT DISTINCT pool, position FROM (
    SELECT '0x6Ecfa38FeE8a5277B91eFdA204c235814F0122E8' AS pool, position FROM tick_hit_wsteth
    UNION ALL
    SELECT '0xAB709e26Fa6B0A30c119D8c55B887DeD24952473', position FROM tick_hit_wbtc
    UNION ALL SELECT pool, position FROM liq
    UNION ALL SELECT pool, position FROM busy
  ) u
)
SELECT json_build_object(
  'sample', (SELECT json_agg(json_build_object('pool', pool, 'position', position)) FROM sample),
  'operate', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT o.pool, o.position, o.block_number, o.tx_index, o.log_index,
             o.delta_colls::text, o.delta_debts::text, o.protocol_fees::text, o.block_timestamp
      FROM fx_v2_operate o JOIN sample s ON s.pool=o.pool AND s.position=o.position
      ORDER BY o.block_number, o.log_index) t),
  'liquidate', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT l.pool, l.position, l.block_number, l.tx_index, l.log_index,
             l.colls::text, l.fx_usd_debts::text, l.stable_debts::text, l.block_timestamp
      FROM fx_v2_liquidate l JOIN sample s ON s.pool=l.pool AND s.position=l.position
      ORDER BY l.block_number, l.log_index) t),
  'snap_wsteth', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT n.position, n.block_number, n.log_index, n.tick,
             n.coll_shares::text, n.debt_shares::text, n.price::text
      FROM fx_v2_snapshot_wsteth n
      JOIN sample s ON s.pool='0x6Ecfa38FeE8a5277B91eFdA204c235814F0122E8' AND s.position=n.position
      ORDER BY n.block_number, n.log_index) t),
  'snap_wbtc', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT n.position, n.block_number, n.log_index, n.tick,
             n.coll_shares::text, n.debt_shares::text, n.price::text
      FROM fx_v2_snapshot_wbtc n
      JOIN sample s ON s.pool='0xAB709e26Fa6B0A30c119D8c55B887DeD24952473' AND s.position=n.position
      ORDER BY n.block_number, n.log_index) t),
  'rebalance_tick', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT pool, tick, block_number, tx_index, log_index,
             colls::text, fx_usd_debts::text, stable_debts::text, block_timestamp
      FROM fx_v2_rebalance_tick ORDER BY block_number, log_index) t),
  'redeem', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT pool, block_number, log_index, colls::text, debts::text, block_timestamp
      FROM fx_v2_redeem ORDER BY block_number) t)
);
