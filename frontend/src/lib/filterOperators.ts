// Only the affirmative operator is offered on the filter fields that use these.
// The Tasks and Projects pages read just `.values[0]` per field (and the URL can
// only say "filtered to these" or "no filter"), so a select-type field's other
// vendored-default operators ("is not", "is empty", "is not empty") would render
// a chip whose label lies about what is actually sent (a "Status is not DONE"
// chip would still filter as "Status is DONE").
export const IS_OPERATOR = [{ value: "is", label: "is" }];
export const IS_ANY_OF_OPERATOR = [{ value: "is_any_of", label: "is any of" }];
