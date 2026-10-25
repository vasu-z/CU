import { CampusGraph, CampusNode } from "./campusRouter";

export interface LocalizationResult {
  isLocalized: boolean;
  node: CampusNode | null;
  confidence: number;
  spokenMessage: string;
  matchedAlias?: string;
}

export class CampusLocalizer {
  private graph: CampusGraph | null = null;

  constructor(graph?: CampusGraph) {
    if (graph) {
      this.setGraph(graph);
    }
  }

  public setGraph(graph: CampusGraph): void {
    this.graph = graph;
  }

  /**
   * Snaps user position by matching OCR text from a door sign against campus nodes.
   *
   * @param ocrText Raw text read from door plaque or room sign.
   */
  public localizeFromOcr(ocrText: string): LocalizationResult {
    if (!this.graph) {
      return {
        isLocalized: false,
        node: null,
        confidence: 0,
        spokenMessage: "Campus map is not loaded. Cannot localize position.",
      };
    }

    if (!ocrText || ocrText.trim().length < 3) {
      return {
        isLocalized: false,
        node: null,
        confidence: 0,
        spokenMessage: "I could not read a clear room number or plaque. Please point your camera directly at the door sign and scan again.",
      };
    }

    const cleaned = ocrText.toLowerCase();

    // Check for exact and substring matches across node IDs, labels, and OCR aliases
    let bestMatch: CampusNode | null = null;
    let matchedAlias: string | undefined = undefined;
    let highestScore = 0;

    for (const node of this.graph.nodes) {
      const candidates = [
        node.label.toLowerCase(),
        node.id.toLowerCase(),
        ...(node.ocr_aliases || []).map((a) => a.toLowerCase()),
      ];

      for (const candidate of candidates) {
        if (cleaned.includes(candidate)) {
          // Score by specificity (longer match is higher score)
          const score = candidate.length;
          if (score > highestScore) {
            highestScore = score;
            bestMatch = node;
            matchedAlias = candidate;
          }
        }
      }
    }

    if (bestMatch && highestScore >= 3) {
      const confidence = highestScore >= 6 ? 0.95 : 0.82;
      const spoken = `You are at ${bestMatch.label}, on Floor ${bestMatch.floor} of ${bestMatch.building}.${bestMatch.tactile_cue ? ` ${bestMatch.tactile_cue}.` : ""}`;

      return {
        isLocalized: true,
        node: bestMatch,
        confidence,
        spokenMessage: spoken,
        matchedAlias,
      };
    }

    // Graceful guidance when unmapped (P2 constraint: do not pretend indoor GPS exists)
    return {
      isLocalized: false,
      node: null,
      confidence: 0.3,
      spokenMessage: "I see text on this sign, but it does not match a verified location in our campus map. Please select a known landmark or move to the nearest corridor junction.",
    };
  }

  /**
   * Direct manual selection of starting landmark (e.g. "Main Entrance").
   */
  public localizeFromLandmarkId(nodeId: string): LocalizationResult {
    if (!this.graph) {
      return {
        isLocalized: false,
        node: null,
        confidence: 0,
        spokenMessage: "No campus map loaded.",
      };
    }

    const node = this.graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return {
        isLocalized: false,
        node: null,
        confidence: 0,
        spokenMessage: "Selected landmark not found in campus map.",
      };
    }

    return {
      isLocalized: true,
      node,
      confidence: 1.0,
      spokenMessage: `Starting from ${node.label}, Floor ${node.floor} of ${node.building}.`,
    };
  }
}
