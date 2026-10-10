import type { Metadata } from "next";
import { MemoryBrowser } from "@/components/memory-browser";

export const metadata: Metadata = {
  title: "Remember",
};

export default function MemoryPage() {
  return <MemoryBrowser />;
}
