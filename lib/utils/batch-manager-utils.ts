import { isAddress } from "viem";
import batchManagerService from "@/lib/services/batch-manager-service";

export function getBatchManagerName(address: string): string | undefined {
  if (!isAddress(address)) return undefined;
  const manager = batchManagerService.getByAddress(address);
  return manager?.name;
}

export function getBatchManagerInfo(address: string) {
  if (!isAddress(address)) return null;
  return batchManagerService.getByAddress(address);
}

export function formatBatchManagerDisplay(address: string): string {
  const manager = getBatchManagerInfo(address);
  if (manager) {
    return manager.name;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function isBatchManager(address: string): boolean {
  return batchManagerService.validateAddress(address);
}

export function getBatchManagersByAsset(assetSymbol: string) {
  return batchManagerService.getByAssetSymbol(assetSymbol);
}

export function searchBatchManagers(query: string) {
  return batchManagerService.search(query);
}
