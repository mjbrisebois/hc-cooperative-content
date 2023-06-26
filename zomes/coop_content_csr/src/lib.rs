mod scoped_types;

use std::collections::HashMap;
use lazy_static::lazy_static;
use hdk::prelude::*;
use hdk_extensions::{
    agent_id,
    must_get,
    exists,
    resolve_action_addr,
    // trace_evolutions,
    latest_evolution,
    trace_evolutions_using_authorities_with_exceptions,

    // HDI Extensions
    get_root_origin,
    ScopedTypeConnector,
    UpdateEntryInput,
    GetLinksInput,

    // Macros
    guest_error,
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
    GroupAuthInput,
    GetAllGroupContentInput,
    GetGroupContentInput,
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

type LinkPointerMap = HashMap<AnyLinkableHash, AnyLinkableHash>;
type EvolutionMap = HashMap<AnyLinkableHash, Vec<AnyLinkableHash>>;


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
fn init(_: ()) -> ExternResult<InitCallbackResult> {
    debug!("'{}' init", *ZOME_NAME );
    Ok(InitCallbackResult::Pass)
}


#[hdk_extern]
fn whoami(_: ()) -> ExternResult<AgentInfo> {
    Ok( agent_info()? )
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


#[hdk_extern]
pub fn update_group(input: UpdateEntryInput<GroupEntry>) -> ExternResult<ActionHash> {
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


#[hdk_extern]
pub fn get_group(group_id: ActionHash) -> ExternResult<GroupEntry> {
    debug!("Get latest group entry: {}", group_id );
    let latest_addr = latest_evolution( &group_id )?;
    let record = must_get( &latest_addr )?;

    Ok( GroupEntry::try_from_record( &record )? )
}


#[hdk_extern]
pub fn get_all_group_content_targets(input: GetAllGroupContentInput) -> ExternResult<Vec<(AnyLinkableHash, AnyLinkableHash)>> {
    match input.full_trace {
	None | Some(false) => get_all_group_content_targets_shortcuts( input.group_id ),
	Some(true) => get_all_group_content_targets_full_trace( input.group_id ),
    }
}


#[hdk_extern]
pub fn get_all_group_content_targets_full_trace(group_id: ActionHash) -> ExternResult<Vec<(AnyLinkableHash, AnyLinkableHash)>> {
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
	let content_targets = anchor.create_targets()?;
	debug!("Found {} content links for group authority '{}'", content_targets.len(), anchor.1 );
	content_creates.extend( content_targets );
    }

    let mut targets = vec![];

    for content_addr in content_creates {
	match content_addr.clone().into_action_hash() {
	    Some(addr) => {
		let evolutions = trace_evolutions_using_authorities_with_exceptions( &addr, &group.authorities(), &archived_updates )?;
		targets.push((
		    content_addr,
		    evolutions.last().unwrap().to_owned().into()
		));
	    },
	    None => continue,
	}
    }

    Ok( targets )
}


fn trace_update_map(
    start: &AnyLinkableHash,
    updates: &LinkPointerMap
) -> Vec<AnyLinkableHash> {
    let mut link_map = updates.clone();
    let mut evolutions = vec![ start.to_owned() ];
    let mut base = start.to_owned();

    while let Some(next_addr) = link_map.remove( &base ) {
	evolutions.push( next_addr.to_owned() );
	base = next_addr;
    }

    evolutions
}

#[hdk_extern]
pub fn trace_all_group_content_evolutions_shortcuts(group_id: ActionHash) -> ExternResult<Vec<(AnyLinkableHash, Vec<AnyLinkableHash>)>> {
    debug!("Get latest group content: {}", group_id );
    let latest_addr = latest_evolution( &group_id )?;
    let record = must_get( &latest_addr )?;
    let group_rev = record.action_address().to_owned();

    let mut targets = vec![];
    let mut updates = HashMap::new();

    let auth_archive_anchors = GroupEntry::group_auth_archive_addrs( &group_rev )?;

    debug!("Found {} auth archives for group rev '{}'", auth_archive_anchors.len(), group_rev );
    for auth_archive_addr in auth_archive_anchors.iter() {
	let anchor : GroupAuthArchiveAnchorEntry = must_get( auth_archive_addr )?.try_into()?;
	debug!("Auth archive anchor: {:#?}", anchor );

	let content_ids = anchor.create_targets()?;
	debug!("Found {} content IDs: {:#?}", content_ids.len(), content_ids );
	targets.extend( content_ids );

	let shortcuts = anchor.shortcuts()?;
	debug!("Found {} content update shortcuts: {:#?}", shortcuts.len(), shortcuts );
	for (_,base,target) in shortcuts {
	    updates.insert( base, target );
	}
    }

    let group_auth_anchors = GroupEntry::group_auth_addrs( &group_rev )?;

    debug!("Found {} current authorities for group rev '{}'", group_auth_anchors.len(), group_rev );
    for auth_anchor_addr in group_auth_anchors.iter() {
	let anchor : GroupAuthAnchorEntry = must_get( auth_anchor_addr )?.try_into()?;
	debug!("Auth anchor: {:#?}", anchor );

	let content_ids = anchor.create_targets()?;
	debug!("Found {} content IDs: {:#?}", content_ids.len(), content_ids );
	targets.extend( content_ids );

	let shortcuts = anchor.shortcuts()?;
	debug!("Found {} content update shortcuts: {:#?}", shortcuts.len(), shortcuts );
	for (_,base,target) in shortcuts {
	    updates.insert( base, target );
	}
    }

    let mut content_evolutions = vec![];

    for addr in targets {
	content_evolutions.push((
	    addr.clone(),
	    trace_update_map( &addr, &updates )
	));
    }

    Ok( content_evolutions )
}

#[hdk_extern]
pub fn get_all_group_content_targets_shortcuts(group_id: ActionHash) -> ExternResult<Vec<(AnyLinkableHash, AnyLinkableHash)>> {
    Ok(
	trace_all_group_content_evolutions_shortcuts( group_id )?.into_iter()
	    .filter_map( |(key, evolutions)| {
		let latest_addr = evolutions.last()?.to_owned();
		Some( (key, latest_addr) )
	    })
	    .collect()
    )
}


#[hdk_extern]
pub fn group_auth_anchor_hash(input: GroupAuthInput) -> ExternResult<EntryHash> {
    Ok( hash_entry( GroupAuthAnchorEntry( input.group_id, input.author ) )? )
}

#[hdk_extern]
pub fn group_auth_archive_anchor_hash(input: GroupAuthInput) -> ExternResult<EntryHash> {
    Ok( hash_entry( GroupAuthArchiveAnchorEntry::new( input.group_id, input.author ) )? )
}


#[hdk_extern]
pub fn create_content_link(input: CreateContentLinkInput) -> ExternResult<ActionHash> {
    let author = agent_id()?;
    debug!("Creating content link from GroupAuthAnchorEntry( {}, {} ) => {}", input.group_id, author, input.content_target );
    let anchor = GroupAuthAnchorEntry( input.group_id, author );
    let anchor_hash = hash_entry( &anchor )?;

    create_if_not_exists( &anchor )?;

    Ok( create_link( anchor_hash, input.content_target, LinkTypes::Content, () )? )
}


#[hdk_extern]
pub fn create_content_update_link(input: CreateContentUpdateLinkInput) -> ExternResult<ActionHash> {
    let author = agent_id()?;
    let tag = format!("{}:{}", input.content_id, input.content_prev );
    let anchor = GroupAuthAnchorEntry( input.group_id, author );
    let anchor_hash = hash_entry( &anchor )?;
    debug!("Auth anchor: {:#?}", anchor );

    create_if_not_exists( &anchor )?;

    debug!("Creating content update link from {} --'{}'--> {}", anchor_hash, tag, input.content_next );
    Ok( create_link( anchor_hash, input.content_next, LinkTypes::ContentUpdate, tag.into_bytes() )? )
}


#[hdk_extern]
pub fn delete_content_link(input: GetLinksInput<LinkTypes>) -> ExternResult<Vec<ActionHash>> {
    debug!("GetLinksInput: {:#?}", input );
    let links = get_links( input.base, input.link_type_filter, input.tag )?;
    let mut deleted = vec![];

    for link in links {
	if link.target == input.target {
	    delete_link( link.create_link_hash.clone() )?;
	    deleted.push( link.create_link_hash );
	}
    }

    Ok( deleted )
}


#[hdk_extern]
pub fn get_group_content_latest(input: GetGroupContentInput) -> ExternResult<AnyLinkableHash> {
    match input.full_trace {
	None | Some(false) => get_group_content_latest_shortcuts( input ),
	Some(true) => get_group_content_latest_full_trace( input ),
    }
}

#[hdk_extern]
pub fn get_group_content_latest_full_trace(input: GetGroupContentInput) -> ExternResult<AnyLinkableHash> {
    debug!("Get latest group content: {}", input.group_id );
    let base_addr = resolve_action_addr( &input.content_id )?;
    let latest_addr = latest_evolution( &input.group_id )?;
    let record = must_get( &latest_addr )?;
    let group_rev = record.action_address().to_owned();
    let group : GroupEntry = record.try_into()?;

    let mut archived_updates : Vec<ActionHash> = vec![];
    let auth_archive_anchors = GroupEntry::group_auth_archive_addrs( &group_rev )?;

    debug!("Found {} auth archives for group rev '{}'", auth_archive_anchors.len(), group_rev );
    for auth_archive_addr in auth_archive_anchors.iter() {
	let anchor : GroupAuthArchiveAnchorEntry = must_get( auth_archive_addr )?.try_into()?;

	let archive_updates = anchor.update_targets()?;
	let update_actions : Vec<ActionHash> = archive_updates.iter()
	    .cloned()
	    .filter_map(|target| target.into_action_hash() )
	    .collect();
	debug!("Removed {}/{} archive updates because they were not ActionHash targets", archive_updates.len() - update_actions.len(), archive_updates.len() );
	archived_updates.extend( update_actions );
    }

    Ok(
	trace_evolutions_using_authorities_with_exceptions(
	    &base_addr,
	    &group.authorities(),
	    &archived_updates
	)?.last().unwrap().to_owned().into()
    )
}


#[hdk_extern]
pub fn get_group_content_latest_shortcuts(input: GetGroupContentInput) -> ExternResult<AnyLinkableHash> {
    let content_evolutions : EvolutionMap = trace_all_group_content_evolutions_shortcuts( input.group_id )?
	.into_iter().collect();

    debug!("Looking for {} in: {:#?}", input.content_id, content_evolutions );
    Ok(
	content_evolutions.get( &input.content_id.clone().into() )
	    .ok_or(guest_error!(format!("Content ID ({}) is not in group content: {:?}", input.content_id, content_evolutions.keys() )))?
	    .last().unwrap().to_owned()
    )
}
