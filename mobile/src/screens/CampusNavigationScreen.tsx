import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  AccessibilityInfo,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../theme/colors";
import { speechService } from "../services/speech";
import { hapticsService } from "../services/haptics";
import {
  CampusRouter,
  CampusGraph,
  CampusNode,
  NavigationRoute,
} from "../navigation/campusRouter";
import sampleCampusData from "../data/sample_campus_graph.json";

export interface CampusNavigationScreenProps {
  initialStartNodeId?: string;
  initialDestinationQuery?: string;
  onNavigateBack: () => void;
  onActiveRouteChanged?: (route: NavigationRoute | null) => void;
}

export const CampusNavigationScreen: React.FC<CampusNavigationScreenProps> = ({
  initialStartNodeId,
  initialDestinationQuery,
  onNavigateBack,
  onActiveRouteChanged,
}) => {
  const routerRef = useRef<CampusRouter>(new CampusRouter(sampleCampusData as CampusGraph));
  const [startNodeId, setStartNodeId] = useState<string>(
    initialStartNodeId || "node_turing_entrance"
  );
  const [selectedDestination, setSelectedDestination] = useState<CampusNode | null>(null);
  const [destinationSearch, setDestinationSearch] = useState<string>(initialDestinationQuery || "");
  const [avoidStairs, setAvoidStairs] = useState<boolean>(true);
  const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isRouteCompleted, setIsRouteCompleted] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isSelectingStart, setIsSelectingStart] = useState<boolean>(false);

  const allDestinations: CampusNode[] = routerRef.current.getAllDestinations();
  const startNode = routerRef.current.getNode(startNodeId);

  // Filter destinations based on search query
  const filteredDestinations: CampusNode[] = destinationSearch.trim()
    ? routerRef.current.searchDestinations(destinationSearch)
    : allDestinations;

  // Handle route calculation
  const handleFindRoute = async () => {
    if (!selectedDestination) {
      setRouteError("Please select a destination from the verified campus landmarks below.");
      await speechService.speak("Please select a destination first.", { force: true });
      return;
    }

    await hapticsService.triggerButtonPress();
    setRouteError(null);

    const route = routerRef.current.findRoute(startNodeId, selectedDestination.id, { avoidStairs });
    setActiveRoute(route);
    setCurrentStepIndex(0);
    setIsRouteCompleted(false);
    onActiveRouteChanged?.(route);

    if (route.status === "success") {
      await hapticsService.triggerSuccess();
      const firstStep = route.steps[0];
      const announcement = `Route found. Total distance: ${Math.round(route.totalDistanceMeters)} meters across ${route.steps.length} steps. ${firstStep?.spokenInstruction || ""}`;
      await speechService.speak(announcement, { force: true });
    } else if (route.status === "no_accessible_route") {
      const msg = `No accessible route found without stairs from ${startNode?.label || "your start"} to ${selectedDestination.label}. Stairs are required to reach this destination.`;
      setRouteError(msg);
      await speechService.speak(msg, { force: true });
    } else if (route.status === "already_at_destination") {
      const msg = `You are already at ${selectedDestination.label}.`;
      setRouteError(msg);
      await speechService.speak(msg, { force: true });
    } else {
      const msg = `Could not find a connected campus path to ${selectedDestination.label}. Please verify starting location.`;
      setRouteError(msg);
      await speechService.speak(msg, { force: true });
    }
  };

  const handleNextStep = async () => {
    if (!activeRoute) return;
    await hapticsService.triggerButtonPress();

    const advanceRes = routerRef.current.advanceStep();
    if (advanceRes.isFinished) {
      setIsRouteCompleted(true);
      await hapticsService.triggerSuccess();
      await speechService.speak(
        `You have arrived at ${selectedDestination?.label || "your destination"}.`,
        { force: true }
      );
    } else {
      const nextIdx = routerRef.current.getCurrentStepIndex();
      setCurrentStepIndex(nextIdx);
      if (advanceRes.step) {
        const stepMsg = `Step ${nextIdx + 1} of ${activeRoute.steps.length}: ${advanceRes.step.spokenInstruction}${advanceRes.step.tactileGuidance ? ` ${advanceRes.step.tactileGuidance}` : ""}`;
        await speechService.speak(stepMsg, { force: true });
      }
    }
  };

  const handleRepeatStep = async () => {
    if (!activeRoute) return;
    await hapticsService.triggerBottomLeft();
    const currentStep = activeRoute.steps[currentStepIndex];
    if (currentStep) {
      const msg = `Step ${currentStepIndex + 1} of ${activeRoute.steps.length}: ${currentStep.spokenInstruction}${currentStep.tactileGuidance ? ` ${currentStep.tactileGuidance}` : ""}`;
      await speechService.speak(msg, { force: true });
    }
  };

  const handleCancelRoute = async () => {
    await hapticsService.triggerBottomLeft();
    routerRef.current.cancelRoute();
    setActiveRoute(null);
    setCurrentStepIndex(0);
    setIsRouteCompleted(false);
    onActiveRouteChanged?.(null);
    await speechService.speak("Campus navigation cancelled.", { force: true });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 1. Top Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={onNavigateBack}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          <Text style={styles.backButtonText}>Home</Text>
        </Pressable>

        <Text style={styles.screenTitle} accessibilityRole="header">
          Campus Navigation
        </Text>

        <View style={{ width: 40 }} />
      </View>

      {/* 2. Honest Map Data Disclosure */}
      <View style={styles.disclaimerBanner} accessible={true}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
        <Text style={styles.disclaimerText}>
          Demonstration Campus Layout (Turing Hall & Newton Center).
          Indoor positioning relies on door-sign OCR or landmark confirmation.
        </Text>
      </View>

      {/* 3. ACTIVE ROUTE VIEW (If navigating) */}
      {activeRoute && activeRoute.status === "success" && (
        <View style={styles.activeRouteSection} accessible={true}>
          <View style={styles.activeRouteHeaderRow}>
            <View style={styles.activeRouteBadge}>
              <Text style={styles.activeRouteBadgeText}>NAVIGATION ACTIVE</Text>
            </View>
            <Text style={styles.activeRouteProgress}>
              Step {currentStepIndex + 1} of {activeRoute.steps.length}
            </Text>
          </View>

          {isRouteCompleted ? (
            <View style={styles.completedCard}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
              <Text style={styles.completedTitle}>Destination Reached</Text>
              <Text style={styles.completedSubtitle}>
                You have arrived at {selectedDestination?.label}.
              </Text>
              <Pressable
                onPress={handleCancelRoute}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Finish navigation session"
                style={styles.finishRouteButton}
              >
                <Text style={styles.finishRouteButtonText}>Finish Navigation</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Current Step Instruction Card */}
              {activeRoute.steps[currentStepIndex] && (
                <View style={styles.currentStepCard}>
                  <Text style={styles.stepDistanceText}>
                    Walk ~{Math.round(activeRoute.steps[currentStepIndex].distanceMeters)} meters
                  </Text>
                  <Text style={styles.stepInstructionText}>
                    {activeRoute.steps[currentStepIndex].spokenInstruction}
                  </Text>

                  {activeRoute.steps[currentStepIndex].tactileGuidance ? (
                    <View style={styles.tactileGuidanceWrap}>
                      <Ionicons name="hand-left-outline" size={16} color={Colors.primary} />
                      <Text style={styles.tactileGuidanceText}>
                        {activeRoute.steps[currentStepIndex].tactileGuidance}
                      </Text>
                    </View>
                  ) : null}

                  {activeRoute.steps[currentStepIndex].hazards.length > 0 && (
                    <View style={styles.hazardsWrap}>
                      <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                      <Text style={styles.hazardsText}>
                        Caution: {activeRoute.steps[currentStepIndex].hazards.join(", ")}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Navigation Controls */}
              <View style={styles.navControlsRow}>
                <Pressable
                  onPress={handleNextStep}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Advance to Next Step"
                  style={styles.nextStepButton}
                >
                  <Text style={styles.nextStepButtonText}>Next Step ➡️</Text>
                </Pressable>

                <Pressable
                  onPress={handleRepeatStep}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Repeat current step instruction"
                  style={styles.repeatStepButton}
                >
                  <Ionicons name="refresh" size={18} color={Colors.textPrimary} />
                  <Text style={styles.repeatStepButtonText}>Repeat</Text>
                </Pressable>

                <Pressable
                  onPress={handleCancelRoute}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel active route"
                  style={styles.cancelNavButton}
                >
                  <Ionicons name="close" size={18} color={Colors.error} />
                  <Text style={styles.cancelNavButtonText}>Cancel</Text>
                </Pressable>
              </View>

              {/* Full Steps List Overview */}
              <Text style={styles.allStepsTitle}>Complete Route Steps</Text>
              {activeRoute.steps.map((st, i) => (
                <View
                  key={i}
                  style={[
                    styles.stepOverviewItem,
                    i === (activeRoute.currentStepIndex ?? currentStepIndex) && styles.stepOverviewItemCurrent,
                  ]}
                >
                  <Text style={styles.stepOverviewNumber}>
                    {i + 1}. {st.fromNode.label} ➔ {st.toNode.label}
                  </Text>
                  <Text style={styles.stepOverviewInstruction}>{st.spokenInstruction}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {/* 4. ROUTE SETUP SECTION (If no route or re-planning) */}
      {(!activeRoute || activeRoute.status !== "success") && (
        <View style={styles.routeSetupSection}>
          {/* Starting Point Selection */}
          <Text style={styles.inputSectionLabel}>1. Starting Landmark</Text>
          <View style={styles.startNodeCard}>
            <View style={styles.startNodeTextWrap}>
              <Text style={styles.startNodeTag}>CURRENT STARTING POINT</Text>
              <Text style={styles.startNodeLabel}>{startNode?.label || "Select Starting Landmark"}</Text>
              <Text style={styles.startNodeBuilding}>
                {startNode?.building || "Turing Hall"} • Floor {startNode?.floor ?? 0}
              </Text>
            </View>
            <Pressable
              onPress={() => setIsSelectingStart(!isSelectingStart)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Change starting campus location"
              style={styles.changeStartButton}
            >
              <Text style={styles.changeStartButtonText}>
                {isSelectingStart ? "Close" : "Change"}
              </Text>
            </Pressable>
          </View>

          {/* Start node selector list if opened */}
          {isSelectingStart && (
            <View style={styles.startNodeListDropdown}>
              <Text style={styles.dropdownTitle}>Select Starting Landmark:</Text>
              {allDestinations.map((node) => (
                <Pressable
                  key={node.id}
                  onPress={() => {
                    setStartNodeId(node.id);
                    setIsSelectingStart(false);
                    speechService.speak(`Starting point set to ${node.label}.`, { force: true });
                  }}
                  style={[
                    styles.dropdownItem,
                    startNodeId === node.id && styles.dropdownItemSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      startNodeId === node.id && styles.dropdownItemTextSelected,
                    ]}
                  >
                    {node.label} ({node.building})
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Destination Search */}
          <Text style={styles.inputSectionLabel}>2. Destination Landmark</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search library, room 204, elevator, hall..."
              placeholderTextColor={Colors.textPlaceholder}
              value={destinationSearch}
              onChangeText={setDestinationSearch}
              accessible={true}
              accessibilityLabel="Destination landmark search input"
            />
            {destinationSearch ? (
              <Pressable onPress={() => setDestinationSearch("")}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Selected Destination Indicator */}
          {selectedDestination && (
            <View style={styles.selectedDestBadge}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
              <Text style={styles.selectedDestText}>
                Selected: {selectedDestination.label} ({selectedDestination.building})
              </Text>
            </View>
          )}

          {/* Avoid Stairs Toggle */}
          <View style={styles.accessibilityOptionRow}>
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>Avoid Stairs (Accessible Routing)</Text>
              <Text style={styles.optionDescription}>
                Requires elevators and level corridors only. Refuses stairs strictly.
              </Text>
            </View>
            <Switch
              value={avoidStairs}
              onValueChange={setAvoidStairs}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#FFFFFF"
              accessible={true}
              accessibilityLabel="Avoid stairs toggle switch"
            />
          </View>

          {/* Route Error Notification */}
          {routeError && (
            <View style={styles.routeErrorCard} accessible={true} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={20} color={Colors.error} />
              <Text style={styles.routeErrorText}>{routeError}</Text>
            </View>
          )}

          {/* Calculate Route Button */}
          <Pressable
            onPress={handleFindRoute}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Find accessible route to selected destination"
            style={styles.findRouteButton}
          >
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
            <Text style={styles.findRouteButtonText}>Find Accessible Route</Text>
          </Pressable>

          {/* Destination Suggestions List */}
          <Text style={styles.suggestionsTitle}>
            Verified Campus Destinations ({filteredDestinations.length})
          </Text>

          {filteredDestinations.map((dest) => {
            const isChosen = selectedDestination?.id === dest.id;
            return (
              <Pressable
                key={dest.id}
                onPress={() => {
                  setSelectedDestination(dest);
                  setRouteError(null);
                  speechService.speak(`Selected destination: ${dest.label}.`, { force: true });
                }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Select destination ${dest.label} in ${dest.building}`}
                style={[styles.destCard, isChosen && styles.destCardSelected]}
              >
                <View style={styles.destIconCircle}>
                  <Ionicons
                    name={
                      dest.type === "room"
                        ? "school-outline"
                        : dest.type === "elevator"
                        ? "swap-vertical-outline"
                        : dest.type === "entrance"
                        ? "log-in-outline"
                        : "location-outline"
                    }
                    size={22}
                    color={isChosen ? "#FFFFFF" : Colors.primary}
                  />
                </View>
                <View style={styles.destTextWrap}>
                  <Text style={[styles.destTitle, isChosen && styles.destTitleSelected]}>
                    {dest.label}
                  </Text>
                  <Text style={styles.destSubtitle}>
                    {dest.building} • Floor {dest.floor} • Type: {dest.type}
                  </Text>
                </View>
                <Ionicons
                  name={isChosen ? "radio-button-on" : "radio-button-off"}
                  size={22}
                  color={isChosen ? Colors.primary : Colors.textMuted}
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 60,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  screenTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  disclaimerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.primaryLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  disclaimerText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
    flex: 1,
    fontWeight: "600",
  },
  routeSetupSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  inputSectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  startNodeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  startNodeTextWrap: {
    flex: 1,
  },
  startNodeTag: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  startNodeLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  startNodeBuilding: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  changeStartButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  changeStartButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.primary,
  },
  startNodeListDropdown: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
    maxHeight: 200,
  },
  dropdownTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.textMuted,
    marginBottom: 6,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  dropdownItemSelected: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownItemText: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  dropdownItemTextSelected: {
    fontWeight: "800",
    color: Colors.primary,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  selectedDestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primaryLight,
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  selectedDestText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
  },
  accessibilityOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 16,
  },
  optionTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  routeErrorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.errorBackground,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  routeErrorText: {
    fontSize: 13,
    color: Colors.error,
    fontWeight: "700",
    flex: 1,
  },
  findRouteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 52,
    marginBottom: 20,
  },
  findRouteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  suggestionsTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  destCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  destCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#F0F9FF",
  },
  destIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  destTextWrap: {
    flex: 1,
  },
  destTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  destTitleSelected: {
    color: Colors.primary,
  },
  destSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  activeRouteSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  activeRouteHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  activeRouteBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeRouteBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  activeRouteProgress: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.primary,
  },
  currentStepCard: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  stepDistanceText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
    marginBottom: 4,
  },
  stepInstructionText: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.textPrimary,
    lineHeight: 26,
    marginBottom: 8,
  },
  tactileGuidanceWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primaryLight,
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  tactileGuidanceText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: "700",
    flex: 1,
  },
  hazardsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.warningBackground,
    padding: 8,
    borderRadius: 8,
  },
  hazardsText: {
    fontSize: 13,
    color: Colors.warning,
    fontWeight: "700",
    flex: 1,
  },
  navControlsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  nextStepButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  nextStepButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  repeatStepButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 52,
  },
  repeatStepButtonText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  cancelNavButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.error,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 52,
  },
  cancelNavButtonText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: "800",
  },
  allStepsTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  stepOverviewItem: {
    backgroundColor: Colors.backgroundAlt,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.border,
  },
  stepOverviewItemCurrent: {
    borderLeftColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  stepOverviewNumber: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  stepOverviewInstruction: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  completedCard: {
    alignItems: "center",
    padding: 24,
  },
  completedTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginTop: 12,
    marginBottom: 4,
  },
  completedSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 20,
    textAlign: "center",
  },
  finishRouteButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  finishRouteButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
