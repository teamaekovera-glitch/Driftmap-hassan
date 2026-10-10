"use client";

/**
 * Skeleton of the game-state context. The storage workstream (IndexedDB) will
 * hydrate this provider; screens read state through useGameState so pages
 * stay presentational.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Journey, Mission } from "@/lib/types";

export type GameStateStatus = "idle" | "loading" | "ready" | "error";

export interface GameState {
  status: GameStateStatus;
  journey: Journey | null;
  missions: Mission[];
}

const INITIAL_STATE: GameState = {
  status: "idle",
  journey: null,
  missions: [],
};

const GameStateContext = createContext<GameState | null>(null);

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [state] = useState<GameState>(INITIAL_STATE);
  return (
    <GameStateContext.Provider value={state}>
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameState(): GameState {
  const state = useContext(GameStateContext);
  if (!state) {
    throw new Error("useGameState must be used inside <GameStateProvider>.");
  }
  return state;
}
