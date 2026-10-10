"use client";

/**
 * MissionPanel — the active mission's card: clue, hint, personality reason
 * line, run progress, and the "I think I found it" action that opens the
 * PhotoSheet.
 *
 * Honesty by construction: the props carry no place reference — a pre-reveal
 * panel physically cannot render the place name, even by accident.
 */
import { ClueCard } from "./clue-card";
import { Button } from "./button";
import { Chip } from "./chip";
import { Panel } from "./panel";
import type { Mission } from "@/lib/types";

export interface MissionPanelProps {
  /** The single active mission — pass nothing else. */
  mission: Mission;
  /** 1-based position in the run, for "Mission 2 of 6". */
  position: number;
  total: number;
  /** Missions completed so far. */
  found: number;
  onFindIt: () => void;
  /** True while a save or compression is in flight. */
  busy?: boolean;
}

export function MissionPanel({
  mission,
  position,
  total,
  found,
  onFindIt,
  busy = false,
}: MissionPanelProps) {
  return (
    <Panel title="Active mission" className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-sm text-muted">
          Mission {position} of {total}
        </p>
        <Chip label={`${found} of ${total} found`} active={found > 0} />
      </div>
      <ClueCard clue={mission.clue} hint={mission.hint} className="mt-4" />
      <p className="mt-4 text-sm italic text-muted">{mission.reason}</p>
      <div className="mt-5">
        <Button onClick={onFindIt} disabled={busy} aria-haspopup="dialog">
          I think I found it
        </Button>
      </div>
    </Panel>
  );
}
