import { describe, it, expect, beforeEach } from "@jest/globals";
import { CampusRouter, CampusGraph } from "./campusRouter";
import { CampusLocalizer } from "./localization";
import sampleGraphData from "../../../data/sample_campus_graph.json";

describe("CampusRouter & Localization — Accessible Navigation Tests", () => {
  let router: CampusRouter;
  let localizer: CampusLocalizer;
  const sampleGraph = sampleGraphData as unknown as CampusGraph;

  beforeEach(() => {
    router = new CampusRouter(sampleGraph);
    localizer = new CampusLocalizer(sampleGraph);
  });

  describe("CampusRouter Route Planning", () => {
    it("finds shortest accessible route avoiding stairs via elevator", () => {
      // From Main Entrance to Room 204 on Floor 1 with avoidStairs = true
      const route = router.findRoute("entrance_main", "Room 204", { avoidStairs: true });

      expect(route.status).toBe("success");
      expect(route.destinationNode?.id).toBe("room_204");
      expect(route.usesStairs).toBe(false);

      // Verify path takes elevator and avoids stairs
      const nodeIds = [
        route.startNode?.id,
        ...route.steps.map((s) => s.toNode.id),
      ];
      expect(nodeIds).toContain("elevator_gf");
      expect(nodeIds).toContain("elevator_1f");
      expect(nodeIds).not.toContain("stairs_gf_1f");
      expect(nodeIds).not.toContain("stairs_1f");

      expect(route.spokenSummary).toContain("step-free");
      expect(route.spokenSummary).toContain("Room 204");
    });

    it("allows stair path when avoidStairs is false and it provides a direct route", () => {
      // From Lobby to First floor stairs landing with avoidStairs = false
      const route = router.findRoute("junction_lobby", "First Floor Stairs", {
        avoidStairs: false,
      });

      expect(route.status).toBe("success");
      expect(route.usesStairs).toBe(true);
      expect(route.steps.some((s) => s.hasStairs)).toBe(true);
      expect(route.spokenSummary).toContain("includes stairs");
    });

    it("refuses to invent an accessible route when only stairs exist", () => {
      // Construct a graph where floor 1 is only accessible via stairs
      const stairsOnlyGraph: CampusGraph = {
        version: "1.0",
        campus_name: "Stairs Only Building",
        nodes: [
          { id: "ground", label: "Ground Floor", type: "room", building: "B1", floor: 0 },
          { id: "floor1", label: "Floor 1 Attic", type: "room", building: "B1", floor: 1 },
        ],
        edges: [
          {
            from: "ground",
            to: "floor1",
            distance_meters: 10,
            has_stairs: true,
            spoken_instruction: "Climb the steep spiral stairs.",
          },
        ],
      };

      const strictRouter = new CampusRouter(stairsOnlyGraph);
      const route = strictRouter.findRoute("ground", "Floor 1 Attic", { avoidStairs: true });

      expect(route.status).toBe("no_accessible_route");
      expect(route.steps.length).toBe(0);
      expect(route.spokenSummary).toContain("No accessible route without stairs");
      expect(route.spokenSummary).toContain("elevator assistance");
    });

    it("returns destination_unreachable for unconnected isolated room", () => {
      // room_isolated_tower has no edges connecting to Turing Hall
      const route = router.findRoute("entrance_main", "Observation Tower", { avoidStairs: false });

      expect(route.status).toBe("destination_unreachable");
      expect(route.steps.length).toBe(0);
      expect(route.spokenSummary).toContain("No connected route");
    });

    it("handles unknown start location gracefully", () => {
      const route = router.findRoute("non_existent_node", "room_204");
      expect(route.status).toBe("unknown_start");
      expect(route.spokenSummary).toContain("starting location is not recognized");
    });

    it("handles unknown destination query gracefully", () => {
      const route = router.findRoute("entrance_main", "Cafeteria Building 9");
      expect(route.status).toBe("unknown_destination");
      expect(route.spokenSummary).toContain("could not find");
    });

    it("handles already_at_destination status", () => {
      const route = router.findRoute("room_101", "Room 101");
      expect(route.status).toBe("already_at_destination");
      expect(route.spokenSummary).toContain("already at");
    });

    it("supports turn-by-turn step advancement, repeat, and cancellation", () => {
      const route = router.findRoute("entrance_main", "room_101", { avoidStairs: true });
      expect(route.status).toBe("success");

      // Check current instruction
      const instruction1 = router.repeatCurrentInstruction();
      expect(instruction1).toContain("Step 1");

      // Advance to step 2
      const step2 = router.advanceStep();
      expect(step2.isFinished).toBe(false);
      expect(step2.spokenMessage).toContain("Step 2");

      // Advance to finish
      const finalStep = router.advanceStep();
      expect(finalStep.isFinished).toBe(true);
      expect(finalStep.spokenMessage).toContain("arrived at");

      // Cancel route
      router.cancelRoute();
      expect(router.getActiveRoute()).toBeNull();
    });

    it("returns node lists and navigable destinations accurately", () => {
      const allNodes = router.getAllNodes();
      expect(allNodes.length).toBeGreaterThan(5);

      const node = router.getNode("room_101");
      expect(node).toBeDefined();
      expect(node?.label).toBe("Room 101 Lecture Hall");

      const destinations = router.getNavigableDestinations();
      expect(destinations.length).toBeGreaterThan(0);
      // All destinations should be rooms, entrances, landmarks, or restrooms, not corridors/stairs
      expect(destinations.every((d) => d.type !== "stairs" && d.type !== "junction")).toBe(true);
    });
  });

  describe("CampusLocalizer Sign Snapping", () => {
    it("snaps to room_204 when reading a door sign with OCR", () => {
      const ocrSignText = "ROOM 204\nDEPARTMENT OF COMPUTER SCIENCE\nDR. ALAN TURING";
      const result = localizer.localizeFromOcr(ocrSignText);

      expect(result.isLocalized).toBe(true);
      expect(result.node?.id).toBe("room_204");
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.spokenMessage).toContain("Room 204");
      expect(result.spokenMessage).toContain("Floor 1");
    });

    it("snaps to Science Library when OCR reads library entrance sign", () => {
      const ocrLibraryText = "CAMPUS SCIENCE LIBRARY\nHOURS 8 AM - 10 PM";
      const result = localizer.localizeFromOcr(ocrLibraryText);

      expect(result.isLocalized).toBe(true);
      expect(result.node?.id).toBe("landmark_library");
      expect(result.spokenMessage).toContain("Science Library");
    });

    it("fails gracefully without inventing position when reading unmapped text", () => {
      const unknownText = "Janitor Closet Supply Station";
      const result = localizer.localizeFromOcr(unknownText);

      expect(result.isLocalized).toBe(false);
      expect(result.node).toBeNull();
      expect(result.spokenMessage).toContain("does not match a verified location");
    });

    it("fails safely when text is too short or noisy", () => {
      const noisyText = "ab";
      const result = localizer.localizeFromOcr(noisyText);

      expect(result.isLocalized).toBe(false);
      expect(result.spokenMessage).toContain("could not read a clear room number");
    });
  });
});
