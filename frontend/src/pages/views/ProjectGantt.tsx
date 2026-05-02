import { useState } from "react";
import { GanttFrame } from "@/components/gantt/GanttFrame";
import { TaskFormModal } from "@/components/TaskFormModal";
import type { Task } from "@/lib/queries";
import { useProjectContext } from "../ProjectDetail";

export function ProjectGantt() {
  const { project } = useProjectContext();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [createState, setCreateState] = useState<{
    open: boolean;
    sectionId: number | null;
  }>({ open: false, sectionId: null });

  return (
    <>
      <GanttFrame
        projectId={project.id}
        baselineLockedAt={project.baselineLockedAt}
        baselineLockedBy={project.baselineLockedBy}
        onEditTask={setEditTask}
        onCreateTaskOpen={(sectionId) => setCreateState({ open: true, sectionId })}
      />

      {editTask && (
        <TaskFormModal
          mode="edit"
          open={editTask !== null}
          onClose={() => setEditTask(null)}
          projectId={project.id}
          task={editTask}
        />
      )}

      {createState.open && (
        <TaskFormModal
          mode="create"
          open={createState.open}
          onClose={() => setCreateState({ open: false, sectionId: null })}
          projectId={project.id}
          initialSectionId={createState.sectionId}
          initialParentTaskId={null}
        />
      )}
    </>
  );
}
