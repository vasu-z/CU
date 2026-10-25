/**
 * Saarthi Campus Accessible Router.
 *
 * Implements Dijkstra-based accessible route planning on a university campus graph.
 *
 * Safety Constraints (P4 & Standing Rules):
 * - Never claims "the path is clear".
 * - When `avoidStairs: true`, strictly refuses to invent an accessible route if no stair-free path exists.
 * - Always reports tactile cues, landmarks, and potential hazards along the route.
 * - Discloses if navigation relies on demonstration sample campus data.
 */

export interface CampusNode {
  id: string;
  label: string;
  type: "entrance" | "room" | "junction" | "elevator" | "stairs" | "landmark" | "restroom";
  building: string;
  floor: number;
  ocr_aliases?: string[];
  tactile_cue?: string;
}

export interface CampusEdge {
  from: string;
  to: string;
  distance_meters: number;
  bearing_degrees?: number;
  has_stairs: boolean;
  spoken_instruction: string;
  tactile_guidance?: string;
  hazards?: string[];
}

export interface CampusGraph {
  version: string;
  campus_name: string;
  is_sample_demo_data?: boolean;
  disclaimer?: string;
  nodes: CampusNode[];
  edges: CampusEdge[];
}

export interface NavigationStep {
  stepIndex: number;
  fromNode: CampusNode;
  toNode: CampusNode;
  distanceMeters: number;
  hasStairs: boolean;
  spokenInstruction: string;
  tactileGuidance?: string;
  hazards: string[];
}

export type RouteStatus =
  | "success"
  | "no_accessible_route"
  | "destination_unreachable"
  | "unknown_start"
  | "unknown_destination"
  | "already_at_destination";

export interface NavigationRoute {
  status: RouteStatus;
  startNode: CampusNode | null;
  destinationNode: CampusNode | null;
  totalDistanceMeters: number;
  steps: NavigationStep[];
  usesStairs: boolean;
  spokenSummary: string;
  isDemoData: boolean;
  currentStepIndex?: number;
}

export class CampusRouter {
  private graph: CampusGraph | null = null;
  private nodeMap: Map<string, CampusNode> = new Map();
  private adjacency: Map<string, CampusEdge[]> = new Map();
  private activeRoute: NavigationRoute | null = null;
  private currentStepIndex: number = 0;

  constructor(graph?: CampusGraph) {
    if (graph) {
      this.loadGraph(graph);
    }
  }

  /**
   * Load and index a verified campus graph.
   */
  public loadGraph(graph: CampusGraph): void {
    this.graph = graph;
    this.nodeMap.clear();
    this.adjacency.clear();

    for (const node of graph.nodes) {
      this.nodeMap.set(node.id, node);
      this.adjacency.set(node.id, []);
    }

    for (const edge of graph.edges) {
      const list = this.adjacency.get(edge.from);
      if (list) {
        list.push(edge);
      }
    }
  }

  /**
   * Find a campus node matching a user query (room number, building, or landmark name).
   */
  public findDestinationNode(query: string): CampusNode | null {
    if (!this.graph || !query) return null;
    const q = query.toLowerCase().trim();

    // 1. Direct ID match
    if (this.nodeMap.has(q)) {
      return this.nodeMap.get(q)!;
    }

    // 2. Exact label match
    for (const node of this.graph.nodes) {
      if (node.label.toLowerCase() === q) {
        return node;
      }
    }

    // 3. OCR aliases match
    for (const node of this.graph.nodes) {
      if (node.ocr_aliases) {
        for (const alias of node.ocr_aliases) {
          if (alias.toLowerCase() === q) {
            return node;
          }
        }
      }
    }

    // 4. Substring inclusion
    for (const node of this.graph.nodes) {
      if (node.label.toLowerCase().includes(q)) {
        return node;
      }
      if (node.ocr_aliases) {
        for (const alias of node.ocr_aliases) {
          if (q.includes(alias.toLowerCase()) || alias.toLowerCase().includes(q)) {
            return node;
          }
        }
      }
    }

    return null;
  }

  /**
   * Plan an accessible route from a known starting node to a destination query.
   *
   * @param startNodeId Verified ID of user's current node.
   * @param destinationQuery Room number, landmark, or destination label.
   * @param options.avoidStairs When true, skips all stair edges. Refuses to invent route if none exists.
   */
  public findRoute(
    startNodeId: string,
    destinationQuery: string,
    options: { avoidStairs?: boolean } | boolean = {}
  ): NavigationRoute {
    const avoidStairs = typeof options === "boolean" ? options : (options.avoidStairs ?? true);
    const isDemo = Boolean(this.graph?.is_sample_demo_data);

    if (!this.graph) {
      return {
        status: "unknown_start",
        startNode: null,
        destinationNode: null,
        totalDistanceMeters: 0,
        steps: [],
        usesStairs: false,
        spokenSummary: "No campus map is currently loaded. Please load a campus map.",
        isDemoData: false,
      };
    }

    const startNode = this.nodeMap.get(startNodeId);
    if (!startNode) {
      return {
        status: "unknown_start",
        startNode: null,
        destinationNode: null,
        totalDistanceMeters: 0,
        steps: [],
        usesStairs: false,
        spokenSummary: "Your starting location is not recognized on the campus map. Please scan a nearby door plaque or select a landmark.",
        isDemoData: isDemo,
      };
    }

    const destNode = this.findDestinationNode(destinationQuery);
    if (!destNode) {
      return {
        status: "unknown_destination",
        startNode,
        destinationNode: null,
        totalDistanceMeters: 0,
        steps: [],
        usesStairs: false,
        spokenSummary: `I could not find "${destinationQuery}" on this campus map. Please check the room number or building name.`,
        isDemoData: isDemo,
      };
    }

    if (startNode.id === destNode.id) {
      return {
        status: "already_at_destination",
        startNode,
        destinationNode: destNode,
        totalDistanceMeters: 0,
        steps: [],
        usesStairs: false,
        spokenSummary: `You are already at ${destNode.label}.`,
        isDemoData: isDemo,
      };
    }

    // Dijkstra's algorithm with accessibility filter
    interface NodeRecord {
      dist: number;
      prevEdge: CampusEdge | null;
      prevNodeId: string | null;
    }

    const distances = new Map<string, NodeRecord>();
    const unvisited = new Set<string>();

    for (const [nodeId] of this.nodeMap) {
      distances.set(nodeId, { dist: Infinity, prevEdge: null, prevNodeId: null });
      unvisited.add(nodeId);
    }

    distances.get(startNode.id)!.dist = 0;

    while (unvisited.size > 0) {
      // Find unvisited node with lowest distance
      let currentId: string | null = null;
      let lowestDist = Infinity;

      for (const id of unvisited) {
        const d = distances.get(id)!.dist;
        if (d < lowestDist) {
          lowestDist = d;
          currentId = id;
        }
      }

      if (!currentId || lowestDist === Infinity) {
        break; // Remaining nodes are unreachable
      }

      if (currentId === destNode.id) {
        break; // Destination reached
      }

      unvisited.delete(currentId);

      const neighbors = this.adjacency.get(currentId) || [];
      for (const edge of neighbors) {
        if (!unvisited.has(edge.to)) continue;

        // Accessibility Rule: strictly avoid stairs if requested
        if (avoidStairs && edge.has_stairs) {
          continue;
        }

        const newDist = lowestDist + edge.distance_meters;
        const currentTargetDist = distances.get(edge.to)!.dist;

        if (newDist < currentTargetDist) {
          distances.set(edge.to, {
            dist: newDist,
            prevEdge: edge,
            prevNodeId: currentId,
          });
        }
      }
    }

    const destRecord = distances.get(destNode.id);

    // If destination was not reached
    if (!destRecord || destRecord.dist === Infinity) {
      // Check if a path existed WITH stairs to provide clear accessibility feedback
      if (avoidStairs) {
        const stairsRoute = this.findRoute(startNodeId, destinationQuery, { avoidStairs: false });
        if (stairsRoute.status === "success") {
          return {
            status: "no_accessible_route",
            startNode,
            destinationNode: destNode,
            totalDistanceMeters: 0,
            steps: [],
            usesStairs: false,
            spokenSummary: `No accessible route without stairs was found between ${startNode.label} and ${destNode.label}. The only available path requires stairs. Please ask building staff or security for elevator assistance.`,
            isDemoData: isDemo,
          };
        }
      }

      return {
        status: "destination_unreachable",
        startNode,
        destinationNode: destNode,
        totalDistanceMeters: 0,
        steps: [],
        usesStairs: false,
        spokenSummary: `No connected route could be found from ${startNode.label} to ${destNode.label} on this campus map.`,
        isDemoData: isDemo,
      };
    }

    // Backtrack route from destination to start
    const steps: NavigationStep[] = [];
    let curr = destNode.id;
    let usesStairs = false;

    while (curr !== startNode.id) {
      const rec = distances.get(curr)!;
      const edge = rec.prevEdge!;
      const fromNode = this.nodeMap.get(rec.prevNodeId!)!;
      const toNode = this.nodeMap.get(curr)!;

      if (edge.has_stairs) usesStairs = true;

      steps.unshift({
        stepIndex: 0, // will reindex below
        fromNode,
        toNode,
        distanceMeters: edge.distance_meters,
        hasStairs: edge.has_stairs,
        spokenInstruction: edge.spoken_instruction,
        tactileGuidance: edge.tactile_guidance,
        hazards: edge.hazards || [],
      });

      curr = rec.prevNodeId!;
    }

    // Reindex steps
    steps.forEach((step, idx) => {
      step.stepIndex = idx + 1;
    });

    const totalDistance = Math.round(destRecord.dist);
    const demoWarning = isDemo ? " Caution: this is demonstration sample map data." : "";
    const spokenSummary = `Route found to ${destNode.label}. Total distance is ${totalDistance} meters across ${steps.length} steps.${usesStairs ? " This route includes stairs." : " This route is step-free."}${demoWarning} Step 1: ${steps[0].spokenInstruction}`;

    const route: NavigationRoute = {
      status: "success",
      startNode,
      destinationNode: destNode,
      totalDistanceMeters: totalDistance,
      steps,
      usesStairs,
      spokenSummary,
      isDemoData: isDemo,
      currentStepIndex: 0,
    };

    this.activeRoute = route;
    this.currentStepIndex = 0;
    return route;
  }

  /**
   * Get the current active navigation step.
   */
  public getCurrentStep(): NavigationStep | null {
    if (!this.activeRoute || this.activeRoute.steps.length === 0) return null;
    return this.activeRoute.steps[this.currentStepIndex] || null;
  }

  /**
   * Advance to the next step along the route.
   */
  public advanceStep(): { step: NavigationStep | null; isFinished: boolean; spokenMessage: string } {
    if (!this.activeRoute) {
      return { step: null, isFinished: true, spokenMessage: "No active navigation route." };
    }

    this.currentStepIndex += 1;
    this.activeRoute.currentStepIndex = this.currentStepIndex;
    if (this.currentStepIndex >= this.activeRoute.steps.length) {
      const dest = this.activeRoute.destinationNode?.label || "your destination";
      this.cancelRoute();
      return {
        step: null,
        isFinished: true,
        spokenMessage: `You have arrived at ${dest}.`,
      };
    }

    const nextStep = this.activeRoute.steps[this.currentStepIndex];
    const spokenMessage = `Step ${nextStep.stepIndex} of ${this.activeRoute.steps.length}: ${nextStep.spokenInstruction}${nextStep.tactileGuidance ? ` ${nextStep.tactileGuidance}` : ""}`;
    return {
      step: nextStep,
      isFinished: false,
      spokenMessage,
    };
  }

  /**
   * Repeat the current navigation step's spoken instruction.
   */
  public repeatCurrentInstruction(): string {
    const step = this.getCurrentStep();
    if (!step) {
      return this.activeRoute?.spokenSummary || "No active navigation instruction to repeat.";
    }
    return `Step ${step.stepIndex}: ${step.spokenInstruction}${step.tactileGuidance ? ` ${step.tactileGuidance}` : ""}`;
  }

  /**
   * Cancel and clear the active route.
   */
  public cancelRoute(): void {
    this.activeRoute = null;
    this.currentStepIndex = 0;
  }

  public getActiveRoute(): NavigationRoute | null {
    return this.activeRoute;
  }

  public getAllNodes(): CampusNode[] {
    return this.graph ? [...this.graph.nodes] : [];
  }

  public getNode(id: string): CampusNode | undefined {
    return this.nodeMap.get(id);
  }

  public getNavigableDestinations(): CampusNode[] {
    if (!this.graph) return [];
    return this.graph.nodes.filter(
      (n) => n.type === "room" || n.type === "entrance" || n.type === "landmark" || n.type === "restroom"
    );
  }

  public getAllDestinations(): CampusNode[] {
    return this.getNavigableDestinations();
  }

  public searchDestinations(query: string): CampusNode[] {
    if (!this.graph || !query.trim()) return this.getNavigableDestinations();
    const q = query.toLowerCase().trim();
    return this.getNavigableDestinations().filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        (n.ocr_aliases && n.ocr_aliases.some((a) => a.toLowerCase().includes(q)))
    );
  }

  public getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }
}
