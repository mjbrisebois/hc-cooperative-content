mod scoped_types;

use lazy_static::lazy_static;
use hdk::prelude::*;
use hdk_extensions::{
    agent_id,
    must_get,
    exists,
    // trace_evolutions,
    latest_evolution,
    trace_evolutions_using_authorities_with_exceptions,

    // HDI Extensions
    get_root_origin,
    ScopedTypeConnector,
};
use coop_content::{
    EntryTypes,
    EntryTypesUnit,
    LinkTypes,

    // Entry Structs
    GroupEntry,
    GroupAuthAnchorEntry,
    GroupAuthArchiveAnchorEntry,

    // Input Structs
    UpdateInput,
    CreateContentLinkInput,
    CreateContentUpdateLinkInput,
};
use scoped_types::entry_traits::*;


lazy_static! {
    static ref ZOME_NAME: String = match zome_info() {
	Ok(info) => format!("{}", info.name ),
	Err(_) => String::from("?"),
    };
}


#[hdk_extern]
fn init(_: ()) -> ExternResult<InitCallbackResult> {
    debug!("'{}' init", *ZOME_NAME );
    Ok(InitCallbackResult::Pass)
}


#[hdk_extern]
pub fn create_group(group: GroupEntry) -> ExternResult<ActionHash> {
    debug!("Creating new group entry: {:#?}", group );
    let action_hash = create_entry( group.to_input() )?;
    let agent_id = agent_id()?;

    for pubkey in group.authorities() {
	let anchor = GroupAuthAnchorEntry( action_hash.to_owned(), pubkey );
	let anchor_hash = hash_entry( &anchor )?;
	debug!("Creating Group Auth anchor ({}): {:#?}", anchor_hash, anchor );
	create_entry( anchor.to_input() )?;
	create_link( action_hash.to_owned(), anchor_hash, LinkTypes::GroupAuth, () )?;
    }

    create_link( agent_id, action_hash.to_owned(), LinkTypes::Group, () )?;

    Ok( action_hash )
}


fn create_if_not_exists<'a, T, E, E2>(entry: &'a T) -> ExternResult<Option<ActionHash>>
where
    T: ScopedTypeConnector<EntryTypes, EntryTypesUnit>,
    Entry: TryFrom<&'a T, Error = E> + TryFrom<T, Error = E2>,
    WasmError: From<E> + From<E2>,
{
    Ok(
	match exists( &hash_entry( entry )? )? {
	    true => None,
	    false => Some( create_entry( entry.to_input() )? ),
	}
    )
}


#[hdk_extern]
pub fn create_content_link(input: CreateContentLinkInput) -> ExternResult<ActionHash> {
    debug!("Creating content link from GroupAuthAnchorEntry( {}, {} ) => {}", input.group_id, input.author, input.content_target );
    let anchor = GroupAuthAnchorEntry( input.group_id, input.author );
    let anchor_hash = hash_entry( &anchor )?;

    create_if_not_exists( &anchor )?;

    Ok( create_link( anchor_hash, input.content_target, LinkTypes::Content, () )? )
}


#[hdk_extern]
pub fn create_content_update_link(input: CreateContentUpdateLinkInput) -> ExternResult<ActionHash> {
    debug!("Creating content link from GroupAuthAnchorEntry( {}, {} ) => {}", input.group_id, input.author, input.content_target );
    let anchor = GroupAuthAnchorEntry( input.group_id, input.author );
    let anchor_hash = hash_entry( &anchor )?;

    create_if_not_exists( &anchor )?;

    let tag = format!("{}:{}", input.content_id, input.content_prev_rev );

    Ok( create_link( anchor_hash, input.content_target, LinkTypes::ContentUpdate, tag.into_bytes() )? )
}


#[hdk_extern]
pub fn get_group(group_id: ActionHash) -> ExternResult<GroupEntry> {
    debug!("Get latest group entry: {}", group_id );
    let latest_addr = latest_evolution( &group_id )?;
    let record = must_get( &latest_addr )?;

    Ok( GroupEntry::try_from_record( &record )? )
}


#[hdk_extern]
pub fn get_group_content_targets(group_id: ActionHash) -> ExternResult<Vec<ActionHash>> {
    debug!("Get latest group content: {}", group_id );
    let latest_addr = latest_evolution( &group_id )?;
    let record = must_get( &latest_addr )?;
    let group_rev = record.action_address().to_owned();
    let group : GroupEntry = record.try_into()?;

    let mut content_creates = vec![];
    let mut archived_updates : Vec<ActionHash> = vec![];

    let auth_archive_anchors = GroupEntry::group_auth_archive_addrs( &group_rev )?;

    debug!("Found {} auth archives for group rev '{}'", auth_archive_anchors.len(), group_rev );
    for auth_archive_addr in auth_archive_anchors.iter() {
	let anchor : GroupAuthArchiveAnchorEntry = must_get( auth_archive_addr )?.try_into()?;
	content_creates.extend( anchor.create_targets()? );

	let archive_updates = anchor.update_targets()?;
	let update_actions : Vec<ActionHash> = archive_updates.iter()
	    .cloned()
	    .filter_map(|target| target.into_action_hash() )
	    .collect();
	debug!("Removed {}/{} archive updates because they were not ActionHash targets", archive_updates.len() - update_actions.len(), archive_updates.len() );
	archived_updates.extend( update_actions );
    }

    let group_auth_anchors = GroupEntry::group_auth_addrs( &group_rev )?;

    debug!("Found {} current authorities for group rev '{}'", group_auth_anchors.len(), group_rev );
    for auth_anchor_addr in group_auth_anchors.iter() {
	let anchor : GroupAuthAnchorEntry = must_get( auth_anchor_addr )?.try_into()?;
	let content_targets = anchor.content_targets()?;
	debug!("Found {} content links for group authority '{}'", content_targets.len(), anchor.1 );
	content_creates.extend( content_targets );
    }

    let mut targets = vec![];

    for content_addr in content_creates {
	match content_addr.into_action_hash() {
	    Some(addr) => {
		let evolutions = trace_evolutions_using_authorities_with_exceptions( &addr, &group.authorities(), &archived_updates )?;
		targets.push( evolutions.last().unwrap().to_owned() )
	    },
	    None => continue,
	}
    }

    Ok( targets )
}


#[hdk_extern]
pub fn update_group(input: UpdateInput) -> ExternResult<ActionHash> {
    debug!("Update group action: {}", input.base );
    let group_id = get_root_origin( &input.base )?.0;
    let prev_group : GroupEntry = must_get( &input.base )?.try_into()?;
    let authorities_diff = prev_group.authorities_diff( &input.entry );

    let action_hash = update_entry( input.base.to_owned(), input.entry.to_input() )?;

    let archive_links = get_links( input.base, LinkTypes::GroupAuthArchive, None )?;
    for link in archive_links {
	create_link( action_hash.to_owned(), link.target, LinkTypes::GroupAuthArchive, link.tag )?;
    }

    for pubkey in authorities_diff.removed {
	debug!("Removed Agent: {}", pubkey );
	let anchor = GroupAuthAnchorEntry( group_id.to_owned(), pubkey.to_owned() );
	let anchor_hash = hash_entry( &anchor )?;
	let archive_anchor = GroupAuthArchiveAnchorEntry::new( action_hash.to_owned(), pubkey.to_owned() );
	let archive_anchor_hash = hash_entry( &archive_anchor )?;

	create_if_not_exists( &archive_anchor )?;
	create_link( action_hash.to_owned(), archive_anchor_hash.to_owned(), LinkTypes::GroupAuthArchive, () )?;

	let creates = get_links( anchor_hash.to_owned(), LinkTypes::Content, None )?;
	let updates = get_links( anchor_hash.to_owned(), LinkTypes::ContentUpdate, None )?;

	debug!("Copying {} creates for auth archive: {}", creates.len(), pubkey );
	for link in creates {
	    create_link( archive_anchor_hash.to_owned(), link.target, LinkTypes::Content, link.tag )?;
	}

	debug!("Copying {} updates for auth archive: {}", updates.len(), pubkey );
	for link in updates {
	    create_link( archive_anchor_hash.to_owned(), link.target, LinkTypes::ContentUpdate, link.tag )?;
	}
    }

    for pubkey in authorities_diff.added {
	debug!("Added Agent: {}", pubkey );
	let anchor = GroupAuthAnchorEntry( group_id.to_owned(), pubkey.to_owned() );
	let anchor_hash = hash_entry( &anchor )?;
	create_if_not_exists( &anchor )?;
	create_link( action_hash.to_owned(), anchor_hash, LinkTypes::GroupAuth, () )?;
    }

    for pubkey in authorities_diff.intersection {
	debug!("Unchanged Agent: {}", pubkey );
	let anchor = GroupAuthAnchorEntry( group_id.to_owned(), pubkey.to_owned() );
	let anchor_hash = hash_entry( &anchor )?;
	create_link( action_hash.to_owned(), anchor_hash, LinkTypes::GroupAuth, () )?;
    }

    Ok( action_hash )
}
