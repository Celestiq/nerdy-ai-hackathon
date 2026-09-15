export interface ItemBankEntry {
  item_id: string;
  concept_id: string;
  difficulty: number;
  /** Optional game-defined identity of what the child actually sees (e.g.
   * same prompt/target). The engine never interprets it -- it only uses it
   * to avoid serving the same content twice in one session when two items
   * (often under different concepts) share it. Absent = item_id. */
  content_key?: string;
}

export type ItemSource = (conceptIds: string[]) => ItemBankEntry[];

/**
 * Where each game's authored item bank is reachable from, keyed by
 * game_id. The engine calls only this registry, never a specific game's
 * item module -- so wiring in a new game's items is a registration, not an
 * engine change. See roadmap.html C13's acceptance criterion.
 */
export class ItemBankRegistry {
  private sources = new Map<string, ItemSource>();

  register(gameId: string, source: ItemSource): void {
    this.sources.set(gameId, source);
  }

  itemsForConcepts(gameId: string, conceptIds: string[]): ItemBankEntry[] {
    return this.sources.get(gameId)?.(conceptIds) ?? [];
  }
}
