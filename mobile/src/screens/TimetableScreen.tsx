import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  AccessibilityInfo,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../theme/colors";
import { speechService } from "../services/speech";
import { hapticsService } from "../services/haptics";
import { readingPipeline } from "../services/readingPipeline";
import {
  TimetableEntry,
  NextClassResult,
  getNextClass,
  formatSpokenTime,
  parseTimeString,
} from "../utils/dateTimeReasoning";

export interface TimetableScreenProps {
  onNavigateBack: () => void;
  onScanTimetable: () => void;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const TimetableScreen: React.FC<TimetableScreenProps> = ({
  onNavigateBack,
  onScanTimetable,
}) => {
  const [classes, setClasses] = useState<TimetableEntry[]>([]);
  const [nextClass, setNextClass] = useState<NextClassResult | null>(null);
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);

  // Form fields
  const [courseCode, setCourseCode] = useState<string>("");
  const [courseName, setCourseName] = useState<string>("");
  const [dayOfWeek, setDayOfWeek] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("10:30");
  const [room, setRoom] = useState<string>("");
  const [building, setBuilding] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const loadSchedule = useCallback(async () => {
    const list = await readingPipeline.getStoredTimetable();
    setClasses(list);
    const next = getNextClass(list, new Date());
    setNextClass(next);
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const handleQueryNextClass = async () => {
    await hapticsService.triggerButtonPress();
    const result = await readingPipeline.queryNextClass();
    setNextClass(result);
  };

  const handleOpenAddModal = () => {
    setEditingClassId(null);
    setCourseCode("");
    setCourseName("");
    setDayOfWeek(1);
    setStartTime("09:00");
    setEndTime("10:30");
    setRoom("");
    setBuilding("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (entry: TimetableEntry) => {
    setEditingClassId(entry.id);
    setCourseCode(entry.courseCode);
    setCourseName(entry.courseName);
    setDayOfWeek(entry.dayOfWeek);
    setStartTime(entry.startTime);
    setEndTime(entry.endTime);
    setRoom(entry.room);
    setBuilding(entry.building || "");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveClass = async () => {
    // Basic validation
    if (!courseName.trim()) {
      setFormError("Course name is required.");
      return;
    }
    if (!room.trim()) {
      setFormError("Classroom or room number is required.");
      return;
    }
    const startParsed = parseTimeString(startTime);
    const endParsed = parseTimeString(endTime);
    if (!startParsed) {
      setFormError("Start time must be in HH:mm format (e.g. 09:30 or 9:30 AM).");
      return;
    }
    if (!endParsed) {
      setFormError("End time must be in HH:mm format (e.g. 11:00 or 11:00 AM).");
      return;
    }

    const startMin = startParsed.hours * 60 + startParsed.minutes;
    const endMin = endParsed.hours * 60 + endParsed.minutes;
    if (endMin <= startMin) {
      setFormError("End time must be after start time.");
      return;
    }

    const entry: TimetableEntry = {
      id: editingClassId || `manual_${Date.now()}`,
      courseCode: courseCode.trim().toUpperCase() || "CLASS",
      courseName: courseName.trim(),
      dayOfWeek,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      room: room.trim(),
      building: building.trim() || undefined,
    };

    if (editingClassId) {
      await readingPipeline.updateTimetableEntry(entry);
      await speechService.speak(`Updated ${entry.courseName}.`, { force: true });
    } else {
      await readingPipeline.addTimetableEntry(entry);
      await speechService.speak(`Added ${entry.courseName} to timetable.`, { force: true });
    }

    setIsModalOpen(false);
    await loadSchedule();
  };

  const handleDeleteClass = async (id: string, name: string) => {
    await hapticsService.triggerButtonPress();
    await readingPipeline.deleteTimetableEntry(id);
    await speechService.speak(`Removed ${name} from timetable.`, { force: true });
    await loadSchedule();
  };

  const handleClearAll = async () => {
    await hapticsService.triggerButtonPress();
    await readingPipeline.clearTimetable();
    await speechService.speak("Timetable cleared.", { force: true });
    await loadSchedule();
  };

  const filteredClasses = classes
    .filter((c) => (selectedDayFilter === "all" ? true : c.dayOfWeek === selectedDayFilter))
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      const pa = parseTimeString(a.startTime);
      const pb = parseTimeString(b.startTime);
      return (pa ? pa.hours * 60 + pa.minutes : 0) - (pb ? pb.hours * 60 + pb.minutes : 0);
    });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 1. Header */}
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
          My Timetable
        </Text>

        <Pressable
          onPress={handleOpenAddModal}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Add new class to schedule"
          style={styles.addButton}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      {/* 2. Instant Next Class Query Card */}
      <View style={styles.nextClassHighlightCard} accessible={true}>
        <View style={styles.nextClassHeader}>
          <View style={styles.nextClassIcon}>
            <Ionicons name="time" size={24} color={Colors.primary} />
          </View>
          <View style={styles.nextClassTitleWrap}>
            <Text style={styles.nextClassBadge}>
              {nextClass?.status === "in_progress"
                ? "ACTIVE CLASS RIGHT NOW"
                : nextClass?.status === "upcoming"
                ? "NEXT SCHEDULED CLASS"
                : "NO UPCOMING CLASSES"}
            </Text>
            <Text style={styles.nextClassTitle}>
              {nextClass?.entry ? nextClass.entry.courseName : "No Classes Pending"}
            </Text>
          </View>
        </View>

        <Text style={styles.nextClassDescription}>
          {nextClass?.spokenDescription || "You have no classes configured in your timetable."}
        </Text>

        <View style={styles.nextClassButtonsRow}>
          <Pressable
            onPress={handleQueryNextClass}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Speak next class aloud"
            style={styles.queryNextButton}
          >
            <Ionicons name="volume-high" size={20} color="#FFFFFF" />
            <Text style={styles.queryNextButtonText}>When is My Next Class?</Text>
          </Pressable>

          <Pressable
            onPress={onScanTimetable}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Scan paper timetable with camera"
            style={styles.scanScheduleButton}
          >
            <Ionicons name="camera" size={20} color={Colors.primary} />
            <Text style={styles.scanScheduleButtonText}>Scan Paper Schedule</Text>
          </Pressable>
        </View>
      </View>

      {/* 3. Day of Week Filter */}
      <View style={styles.dayFilterSection}>
        <Text style={styles.dayFilterLabel}>Filter by Day</Text>
        <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={styles.dayFilterScroll}>
          <Pressable
            onPress={() => setSelectedDayFilter("all")}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Show classes for all days"
            style={[styles.dayFilterChip, selectedDayFilter === "all" && styles.dayFilterChipActive]}
          >
            <Text style={[styles.dayFilterText, selectedDayFilter === "all" && styles.dayFilterTextActive]}>
              All ({classes.length})
            </Text>
          </Pressable>

          {[1, 2, 3, 4, 5, 6, 0].map((dayNum) => {
            const count = classes.filter((c) => c.dayOfWeek === dayNum).length;
            const isSelected = selectedDayFilter === dayNum;
            return (
              <Pressable
                key={dayNum}
                onPress={() => setSelectedDayFilter(dayNum as any)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Show classes for ${DAY_NAMES[dayNum]}`}
                style={[styles.dayFilterChip, isSelected && styles.dayFilterChipActive]}
              >
                <Text style={[styles.dayFilterText, isSelected && styles.dayFilterTextActive]}>
                  {DAY_NAMES[dayNum].substring(0, 3)} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 4. Classes List */}
      <View style={styles.classesSectionHeader}>
        <Text style={styles.classesCountTitle}>
          {selectedDayFilter === "all"
            ? `All Scheduled Classes (${filteredClasses.length})`
            : `${DAY_NAMES[selectedDayFilter]} Classes (${filteredClasses.length})`}
        </Text>
        {classes.length > 0 && (
          <Pressable
            onPress={handleClearAll}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Clear all classes from timetable"
          >
            <Text style={styles.clearAllText}>Clear All</Text>
          </Pressable>
        )}
      </View>

      {filteredClasses.length === 0 ? (
        <View style={styles.emptyCard} accessible={true} accessibilityRole="summary">
          <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Classes Saved</Text>
          <Text style={styles.emptyText}>
            Your schedule is currently empty for this selection.
            {"\n"}You can scan a printed syllabus with your camera or add classes manually.
          </Text>
          <View style={styles.emptyButtonsRow}>
            <Pressable
              onPress={handleOpenAddModal}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Add your first class manually"
              style={styles.emptyAddButton}
            >
              <Text style={styles.emptyAddButtonText}>+ Add Class</Text>
            </Pressable>
            <Pressable
              onPress={onScanTimetable}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Scan paper timetable with camera"
              style={styles.emptyScanButton}
            >
              <Text style={styles.emptyScanButtonText}>📷 Scan with Camera</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        filteredClasses.map((item) => (
          <View key={item.id} style={styles.classItemCard} accessible={true}>
            <View style={styles.classItemTopRow}>
              <View style={styles.classTimeBadge}>
                <Text style={styles.classTimeBadgeText}>
                  {formatSpokenTime(item.startTime)} - {formatSpokenTime(item.endTime)}
                </Text>
              </View>
              <Text style={styles.classDayBadge}>{DAY_NAMES[item.dayOfWeek]}</Text>
            </View>

            <Text style={styles.classItemCourse}>{item.courseName}</Text>
            <Text style={styles.classItemCode}>{item.courseCode}</Text>
            <Text style={styles.classItemRoom}>
              📍 Room {item.room} {item.building ? `• ${item.building}` : ""}
            </Text>

            <View style={styles.classItemActions}>
              <Pressable
                onPress={() => handleOpenEditModal(item)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.courseName}`}
                style={styles.classActionEdit}
              >
                <Ionicons name="pencil" size={16} color={Colors.primary} />
                <Text style={styles.classActionEditText}>Edit</Text>
              </Pressable>

              <Pressable
                onPress={() => handleDeleteClass(item.id, item.courseName)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.courseName}`}
                style={styles.classActionDelete}
              >
                <Ionicons name="trash" size={16} color={Colors.error} />
                <Text style={styles.classActionDeleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {/* 5. ADD / EDIT CLASS MODAL */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>
                  {editingClassId ? "Edit Class" : "Add Class to Schedule"}
                </Text>
                <Pressable
                  onPress={() => setIsModalOpen(false)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Close class editor"
                >
                  <Ionicons name="close" size={24} color={Colors.textPrimary} />
                </Pressable>
              </View>

              {formError && (
                <View style={styles.modalErrorCard}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} />
                  <Text style={styles.modalErrorText}>{formError}</Text>
                </View>
              )}

              {/* Course Name */}
              <Text style={styles.inputLabel}>Course Name *</Text>
              <TextInput
                style={styles.inputField}
                placeholder="e.g. Data Structures & Algorithms"
                placeholderTextColor={Colors.textPlaceholder}
                value={courseName}
                onChangeText={setCourseName}
                accessible={true}
                accessibilityLabel="Course name input"
              />

              {/* Course Code */}
              <Text style={styles.inputLabel}>Course Code</Text>
              <TextInput
                style={styles.inputField}
                placeholder="e.g. CS201"
                placeholderTextColor={Colors.textPlaceholder}
                value={courseCode}
                onChangeText={setCourseCode}
                accessible={true}
                accessibilityLabel="Course code input"
              />

              {/* Day of Week */}
              <Text style={styles.inputLabel}>Day of Week</Text>
              <View style={styles.dayPickerRow}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setDayOfWeek(d as any)}
                    style={[styles.dayPickerChip, dayOfWeek === d && styles.dayPickerChipSelected]}
                    accessible={true}
                    accessibilityRole="radio"
                    accessibilityLabel={DAY_NAMES[d]}
                    accessibilityState={{ selected: dayOfWeek === d }}
                  >
                    <Text
                      style={[
                        styles.dayPickerText,
                        dayOfWeek === d && styles.dayPickerTextSelected,
                      ]}
                    >
                      {DAY_NAMES[d].substring(0, 3)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Times */}
              <View style={styles.twoColumnRow}>
                <View style={styles.halfCol}>
                  <Text style={styles.inputLabel}>Start Time * (HH:mm)</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="09:00"
                    placeholderTextColor={Colors.textPlaceholder}
                    value={startTime}
                    onChangeText={setStartTime}
                    accessible={true}
                    accessibilityLabel="Class start time in 24 hour HH:mm"
                  />
                </View>

                <View style={styles.halfCol}>
                  <Text style={styles.inputLabel}>End Time * (HH:mm)</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="10:30"
                    placeholderTextColor={Colors.textPlaceholder}
                    value={endTime}
                    onChangeText={setEndTime}
                    accessible={true}
                    accessibilityLabel="Class end time in 24 hour HH:mm"
                  />
                </View>
              </View>

              {/* Room & Building */}
              <View style={styles.twoColumnRow}>
                <View style={styles.halfCol}>
                  <Text style={styles.inputLabel}>Room *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. 204 or Hall B"
                    placeholderTextColor={Colors.textPlaceholder}
                    value={room}
                    onChangeText={setRoom}
                    accessible={true}
                    accessibilityLabel="Classroom number"
                  />
                </View>

                <View style={styles.halfCol}>
                  <Text style={styles.inputLabel}>Building</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. Turing Hall"
                    placeholderTextColor={Colors.textPlaceholder}
                    value={building}
                    onChangeText={setBuilding}
                    accessible={true}
                    accessibilityLabel="Campus building name"
                  />
                </View>
              </View>

              {/* Modal Buttons */}
              <View style={styles.modalButtonsRow}>
                <Pressable
                  onPress={() => setIsModalOpen(false)}
                  style={styles.modalCancelButton}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleSaveClass}
                  style={styles.modalSaveButton}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Save class to timetable"
                >
                  <Text style={styles.modalSaveButtonText}>
                    {editingClassId ? "Update Class" : "Save Class"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
    marginBottom: 20,
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
    fontSize: 20,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  nextClassHighlightCard: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  nextClassHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  nextClassIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nextClassTitleWrap: {
    flex: 1,
  },
  nextClassBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  nextClassTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  nextClassDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  nextClassButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  queryNextButton: {
    flex: 1.3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 48,
  },
  queryNextButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  scanScheduleButton: {
    flex: 1.1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 48,
  },
  scanScheduleButtonText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  dayFilterSection: {
    marginBottom: 18,
  },
  dayFilterLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  dayFilterScroll: {
    flexDirection: "row",
  },
  dayFilterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginRight: 8,
  },
  dayFilterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayFilterText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  dayFilterTextActive: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  classesSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  classesCountTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.error,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyButtonsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  emptyAddButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  emptyAddButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  emptyScanButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  emptyScanButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  classItemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  classItemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  classTimeBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  classTimeBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.primary,
  },
  classDayBadge: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  classItemCourse: {
    fontSize: 17,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  classItemCode: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
    marginBottom: 6,
  },
  classItemRoom: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  classItemActions: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 10,
  },
  classActionEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
  },
  classActionEditText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
  },
  classActionDelete: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: Colors.errorBackground,
  },
  classActionDeleteText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.error,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
  },
  modalScrollContent: {
    padding: 20,
    justifyContent: "center",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  modalErrorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.errorBackground,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  modalErrorText: {
    fontSize: 13,
    color: Colors.error,
    fontWeight: "700",
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.textPrimary,
    marginBottom: 14,
    minHeight: 48,
  },
  dayPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 14,
  },
  dayPickerChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  dayPickerChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayPickerText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  dayPickerTextSelected: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
  modalButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  modalSaveButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
