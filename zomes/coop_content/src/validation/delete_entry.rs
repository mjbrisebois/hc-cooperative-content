use crate::{
    hdi,
    hdi_extensions,
    EntryTypesUnit,
};
use hdi::prelude::*;
use hdi_extensions::{
    summon_create_action,
    detect_app_entry_unit,
    // Macros
    invalid,
};


pub fn validation(
    original_action_hash: ActionHash,
    _original_entry_hash: EntryHash,
    _delete: Delete
) -> ExternResult<ValidateCallbackResult> {
    let create = summon_create_action( &original_action_hash )?;

    match detect_app_entry_unit( &create )? {
        EntryTypesUnit::Group => {
            invalid!("Groups cannot be deleted; they can be marked as 'dead' using counter-signing".to_string())
        },
        EntryTypesUnit::ContributionsAnchor => {
            invalid!("Anchors are required for the continuity of group content evolution".to_string())
        },
        EntryTypesUnit::ArchivedContributionsAnchor => {
            invalid!("Anchors are required for the continuity of group content evolution".to_string())
        },
        // entry_type_unit => invalid!(format!("Delete validation not implemented for entry type: {:?}", entry_type_unit )),
    }
}
