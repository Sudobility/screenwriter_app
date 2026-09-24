import type { EntityKind } from "@sudobility/writing_core";

/** camelCase kind -> a readable label ("makeupHair" -> "Makeup/Hair"); everything else just gets its
 * first letter capitalized. Shared by `EditorSidebar` (the Catalog tree) and `EntityDetailView`. */
const KIND_LABELS: Partial<Record<EntityKind, string>> = {
  makeupHair: "Makeup/Hair", specialEffect: "Special effect", visualEffect: "Visual effect", mechanicalEffect: "Mechanical effect",
  backgroundActor: "Background actor", additionalLabor: "Additional labor", animalHandler: "Animal handler", artDepartment: "Art department",
  scriptDay: "Script day", specialEquipment: "Special equipment", setDressing: "Set dressing",
};

export const kindLabel = (k: EntityKind): string => KIND_LABELS[k] ?? k[0]!.toUpperCase() + k.slice(1);
