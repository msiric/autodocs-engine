// src/mcp/queries.ts — Re-export barrel for backward compatibility
// All implementation lives in src/mcp/queries/*.ts
//
// The type import below preserves this file's position in the import chain
// (it was historically a heavy importer of types.ts with 13+ symbols).

import type {
  AntiPattern,
  CallGraphEdge,
  CoChangeEdge,
  CommandSet,
  ContributionPattern,
  Convention,
  ExecutionFlow,
  FileImportEdge,
  ImplicitCouplingEdge,
  PackageAnalysis,
  PackageArchitecture,
  PublicAPIEntry,
  StructuredAnalysis,
  WorkflowRule,
} from "../types.js";

// Re-export type aliases so barrel consumers can access them without a separate import
export type {
  AntiPattern,
  CallGraphEdge,
  CoChangeEdge,
  CommandSet,
  ContributionPattern,
  Convention,
  ExecutionFlow,
  FileImportEdge,
  ImplicitCouplingEdge,
  PackageAnalysis,
  PackageArchitecture,
  PublicAPIEntry,
  StructuredAnalysis,
  WorkflowRule,
};

export * from "./queries/index.js";
