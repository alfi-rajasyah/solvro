// Searchable owner picker for the Admin > Project Override tab. Replaces a
// native <select> that rendered every active user once per project row.
// Closed, the input shows the current TAM as its placeholder; typing filters
// the list and only the matching users are rendered.
import { useState } from "react";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/reui/autocomplete";
import { FIELD_FOCUS } from "@/lib/utils";

export interface TamCandidate {
  id: number;
  username: string;
  role: string;
}

interface Props {
  /** Names the row in the accessible name, e.g. the project. */
  label: string;
  currentId: number;
  currentName: string;
  candidates: readonly TamCandidate[];
  onPick: (id: number) => void;
}

export function TamPicker({ label, currentId, currentName, candidates, onPick }: Props) {
  const [query, setQuery] = useState("");
  return (
    <Autocomplete
      items={candidates}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(u: TamCandidate) => u.username}
      openOnInputClick
    >
      <AutocompleteInput
        size="sm"
        placeholder={currentName}
        aria-label={`Reassign TAM for ${label}, currently ${currentName}`}
        className={`rounded-sm border-outline-variant bg-surface text-xs text-on-surface placeholder:text-on-surface ${FIELD_FOCUS}`}
      />
      <AutocompleteContent className="min-w-56">
        <AutocompleteEmpty>No user matches.</AutocompleteEmpty>
        <AutocompleteList>
          {(u: TamCandidate) => (
            <AutocompleteItem
              key={u.id}
              value={u}
              onClick={() => {
                setQuery("");
                if (u.id !== currentId) onPick(u.id);
              }}
              className="text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{u.username}</span>
              <span className="text-meta text-on-surface-variant">{u.role}</span>
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  );
}
