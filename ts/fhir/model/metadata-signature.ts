/** Order-normalized signature of gate-relevant CapabilityStatement fields (excludes fetchedAt) for change detection. */
export const metadataSignature = (resources: CapabilitySummary["resources"], sys: string[]): string =>
   JSON.stringify({
      sys: [...sys].sort(),
      res: [...resources]
         .map((r) => ({
            type: r.type,
            interactions: [...r.interactions].sort(),
            searchParams: [...r.searchParams].sort(),
            operations: [...r.operations].sort(),
            includes: [...r.includes].sort(),
            revincludes: [...r.revincludes].sort(),
         }))
         .sort((a, b) => a.type.localeCompare(b.type)),
   })
