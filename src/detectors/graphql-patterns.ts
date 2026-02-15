import type { Convention, ConventionConfidence, ConventionDetector } from "../types.js";
import { sourceParsedFiles } from "../convention-extractor.js";

export const graphqlPatternDetector: ConventionDetector = (files, tiers, _warnings) => {
  const conventions: Convention[] = [];

  // Check generated graphql interface files (in all files, not just source)
  const generatedGql = files.filter(
    (f) =>
      f.isGeneratedFile &&
      (f.relativePath.includes(".graphql.interface.") ||
        f.relativePath.includes(".generated.")),
  );

  if (generatedGql.length > 0) {
    conventions.push({
      category: "graphql",
      name: "Generated GraphQL interfaces",
      description: `Package has generated GraphQL interface files`,
      confidence: conf(generatedGql.length, generatedGql.length),
      examples: generatedGql.slice(0, 3).map((f) => f.relativePath),
    });
  }

  // Check for Apollo/GraphQL hook usage
  const sourceFiles = sourceParsedFiles(files, tiers);
  let queryCount = 0, mutationCount = 0;
  for (const f of sourceFiles) {
    queryCount += f.contentSignals.useQueryCount;
    mutationCount += f.contentSignals.useMutationCount;
  }

  if (queryCount > 0 || mutationCount > 0) {
    conventions.push({
      category: "graphql",
      name: "GraphQL hooks",
      description: `Uses useQuery/useMutation hooks for GraphQL operations`,
      confidence: conf(queryCount + mutationCount, queryCount + mutationCount),
      examples: [
        ...(queryCount > 0 ? [`useQuery: ${queryCount} usages`] : []),
        ...(mutationCount > 0 ? [`useMutation: ${mutationCount} usages`] : []),
      ],
    });
  }

  return conventions;
};

function conf(matched: number, total: number): ConventionConfidence {
  const percentage = total > 0 ? Math.round((matched / total) * 100) : 0;
  return {
    matched,
    total,
    percentage,
    description: `${matched} of ${total} (${percentage}%)`,
  };
}
