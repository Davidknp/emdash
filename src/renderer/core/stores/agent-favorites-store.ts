import { makeAutoObservable } from 'mobx';
import { AgentProviderId } from '@shared/agent-provider-registry';

const STORAGE_KEY = 'emdash-favorite-agents';

class AgentFavoritesStore {
  favorites: AgentProviderId[] = [];

  constructor() {
    makeAutoObservable(this);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) this.favorites = JSON.parse(stored) as AgentProviderId[];
    } catch {}
  }

  isFavorite(id: AgentProviderId): boolean {
    return this.favorites.includes(id);
  }

  add(id: AgentProviderId): void {
    if (this.favorites.includes(id)) return;
    this.favorites = [...this.favorites, id];
    this._persist();
  }

  remove(id: AgentProviderId): void {
    this.favorites = this.favorites.filter((f) => f !== id);
    this._persist();
  }

  private _persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.favorites));
    } catch {}
  }
}

export const agentFavoritesStore = new AgentFavoritesStore();
