// src/detectors/state-management.ts — State management pattern detector
// Import-based detection for Redux, Zustand, Jotai, MobX, Recoil, Signals, Context API.
// Reports ALL detected libraries (dominant + supplementary) per adversarial review.

import { buildConfidence, sourceParsedFiles } from "../convention-extractor.js";
import type { Convention, ConventionDetector } from "../types.js";

const STATE_LIBRARIES: Record<string, { label: string; packages: string[] }> = {
  redux: { label: "Redux", packages: ["@reduxjs/toolkit", "react-redux", "redux"] },
  zustand: { label: "Zustand", packages: ["zustand"] },
  jotai: { label: "Jotai", packages: ["jotai"] },
  recoil: { label: "Recoil", packages: ["recoil"] },
  mobx: { label: "MobX", packages: ["mobx", "mobx-react", "mobx-react-lite"] },
  signals: { label: "Signals", packages: ["@preact/signals", "@preact/signals-react", "@angular/core"] },
  valtio: { label: "Valtio", packages: ["valtio"] },
  xstate: { label: "XState", packages: ["xstate", "@xstate/react"] },
};

export const stateManagementDetector: ConventionDetector = (files, tiers, _warnings, _context) => {
  const conventions: Convention[] = [];
  const sourceFiles = sourceParsedFiles(files, tiers);
  if (sourceFiles.length === 0) return conventions;

  // Count files importing each state management library
  const libFileCounts = new Map<string, number>(); // library key → file count

  for (const file of sourceFiles) {
    const fileLibs = new Set<string>(); // dedupe per file
    for (const imp of file.imports) {
      if (imp.isTypeOnly) continue;
      for (const [key, { packages }] of Object.entries(STATE_LIBRARIES)) {
        if (packages.some((pkg) => imp.moduleSpecifier === pkg || imp.moduleSpecifier.startsWith(`${pkg}/`))) {
          fileLibs.add(key);
        }
      }
    }
    for (const key of fileLibs) {
      libFileCounts.set(key, (libFileCounts.get(key) ?? 0) + 1);
    }
  }

  // Detect Context API usage: imports of createContext from react
  let contextApiFiles = 0;
  for (const file of sourceFiles) {
    for (const imp of file.imports) {
      if (imp.isTypeOnly) continue;
      if (imp.moduleSpecifier === "react" && imp.importedNames.includes("createContext")) {
        contextApiFiles++;
        break;
      }
    }
  }
  if (contextApiFiles > 0) {
    libFileCounts.set("context", contextApiFiles);
  }

  if (libFileCounts.size === 0) return conventions;

  // Sort by file count descending
  const sorted = [...libFileCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalFiles = sorted.reduce((sum, [, count]) => sum + count, 0);

  // Build description showing all detected libraries with roles
  const dominant = sorted[0];
  const dominantLabel =
    dominant[0] === "context" ? "React Context API" : (STATE_LIBRARIES[dominant[0]]?.label ?? dominant[0]);

  const parts: string[] = [];
  for (const [key, count] of sorted) {
    const label = key === "context" ? "React Context API" : (STATE_LIBRARIES[key]?.label ?? key);
    parts.push(`${label} (${count} files)`);
  }

  conventions.push({
    category: "state-management",
    source: "stateManagement",
    name: sorted.length === 1 ? `${dominantLabel} state management` : `${dominantLabel} + ${sorted.length - 1} more`,
    description:
      sorted.length === 1 ? `Uses ${dominantLabel} for state management` : `State management: ${parts.join(", ")}`,
    confidence: buildConfidence(totalFiles, sourceFiles.length),
    examples: parts,
  });

  return conventions;
};
