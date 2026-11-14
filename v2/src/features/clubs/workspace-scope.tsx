"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const ClubContext = createContext<{ clubId: number | null; setClubId: (id: number) => void }>({ clubId: null, setClubId: () => {} });
export function WorkspaceScope({ children }: { children: ReactNode }) {
  const [clubId, setClubId] = useState<number | null>(null);
  return <ClubContext value={{ clubId, setClubId }}>{children}</ClubContext>;
}
export function useWorkspaceClub() { return useContext(ClubContext).clubId; }
export function SessionClubScope({ clubId }: { clubId: number }) {
  const { setClubId } = useContext(ClubContext);
  useEffect(() => { setClubId(clubId); }, [clubId, setClubId]);
  return null;
}
