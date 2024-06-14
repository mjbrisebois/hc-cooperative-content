import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-model-dna", process.env.LOG_LEVEL );

import fs				from 'node:fs';
import path				from 'path';
import crypto				from 'crypto';
import { expect }			from 'chai';
import { faker }			from '@faker-js/faker';
import msgpack				from '@msgpack/msgpack';
import json				from '@whi/json';
import { AgentPubKey, HoloHash,
	 ActionHash, EntryHash }	from '@spartan-hc/holo-hash';
import HolochainBackdrop		from '@spartan-hc/holochain-backdrop';
const { Holochain }			= HolochainBackdrop;
import {
    AppInterfaceClient,
}					from '@spartan-hc/app-interface-client';
import {
    intoStruct,
    OptionType, VecType, MapType,
}					from '@whi/into-struct';

// const why				= require('why-is-node-running');
import {
    expect_reject,
    linearSuite,
    createGroupInput,
    createContentInput,
}					from '../utils.js';
import {
    EntryCreationActionStruct,
    GroupStruct,
    ContentStruct,
}					from './types.js';


const delay				= (n) => new Promise(f => setTimeout(f, n));
const __filename			= new URL(import.meta.url).pathname;
const __dirname				= path.dirname( __filename );
const TEST_DNA_PATH			= path.join( __dirname, "../model_dna.dna" );

const DNA_NAME				= "test_dna";

const DEBUG_ZOME			= "debug_csr";
const GEN_ZOME				= "general_csr";
const COOP_ZOME				= "coop_content_csr";
const GOOD_ZOME				= "basic_usage_csr";
const EVIL_ZOME				= "corrupt_csr";


let app_port;
let client;
let alice_client;
let bobby_client;
let carol_client;
let david_client;
let emily_client;
let felix_client;
let group, g1_addr, g1a_addr, g1b_addr;
let c1, c1_addr, c1a_addr;
let c2, c2_addr, c2a_addr, c2aa_addr, c2b_addr;
let c3, c3a, c3_addr, c3a_addr;
let c4, c4_addr, c4a_addr;
let c5, c5_addr;


function phase1_tests () {

    it("should create group via alice (A1)", async function () {
	const group_input		= createGroupInput(
	    [
		alice_client.agent_id,
		emily_client.agent_id,
		felix_client.agent_id,
	    ],
	    bobby_client.agent_id, carol_client.agent_id,
	);
	g1_addr				= await alice_client.call( DNA_NAME, GOOD_ZOME, "create_group", group_input );
	log.debug("Group ID: %s", g1_addr );

	// expect( g1_addr		).to.be.a("ActionHash");
	expect( g1_addr		).to.be.a("Uint8Array");
	expect( g1_addr		).to.have.length( 39 );

	group				= intoStruct( await alice_client.call( DNA_NAME, GOOD_ZOME, "get_group", g1_addr ), GroupStruct );
	log.debug( json.debug( group ) );
    });

    it("should create content (C1 + C2) via alice (A1)", async function () {
	{
	    const content_input		= createContentInput( alice_client.agent_id, g1_addr, g1_addr );
	    c1_addr			= await alice_client.call( DNA_NAME, GOOD_ZOME, "create_content", content_input );
	    log.debug("C1 Address: %s", new ActionHash(c1_addr) );

	    expect( c1_addr		).to.be.a("Uint8Array");
	    expect( c1_addr		).to.have.length( 39 );

	    c1				= intoStruct( await alice_client.call( DNA_NAME, GOOD_ZOME, "get_content", {
		"group_id": g1_addr,
		"content_id": c1_addr,
	    }), ContentStruct );
	    log.debug( json.debug( c1 ) );
	}
	{
	    const content_input		= createContentInput( alice_client.agent_id, g1_addr, g1_addr );
	    c2_addr			= await alice_client.call( DNA_NAME, GOOD_ZOME, "create_content", content_input );
	    log.debug("C2 Address: %s", new ActionHash(c2_addr) );

	    expect( c2_addr		).to.be.a("Uint8Array");
	    expect( c2_addr		).to.have.length( 39 );

	    c2				= intoStruct( await alice_client.call( DNA_NAME, GOOD_ZOME, "get_content", {
		"group_id": g1_addr,
		"content_id": c2_addr,
	    }), ContentStruct );
	    log.debug( json.debug( c2 ) );
	}
    });

    it("should create content (C3) via carol (A3)", async function () {
	{
	    const content_input		= createContentInput( carol_client.agent_id, g1_addr, g1_addr );
	    c3_addr			= await carol_client.call( DNA_NAME, GOOD_ZOME, "create_content", content_input );
	    log.debug("C3 Address: %s", new ActionHash(c3_addr) );

	    expect( c3_addr		).to.be.a("Uint8Array");
	    expect( c3_addr		).to.have.length( 39 );

	    c3				= intoStruct( await alice_client.call( DNA_NAME, GOOD_ZOME, "get_content", {
		"group_id": g1_addr,
		"content_id": c3_addr,
	    }), ContentStruct );
	    log.debug( json.debug( c3 ) );
	}
    });

    it("should update content (C1 => C1a) via carol (A3)", async function () {
	{
	    c1a_addr			= await carol_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
		"base": c1_addr,
		"entry": Object.assign( c1, {
		    "text":		"(updated) " + faker.lorem.sentence(),
		}),
	    });
	    log.debug("C1a Address: %s", new ActionHash(c1a_addr) );

	    expect( c1a_addr		).to.be.a("Uint8Array");
	    expect( c1a_addr		).to.have.length( 39 );
	}
    });

    it("should update content (C2 => C2a) via alice (A1)", async function () {
	{
	    c2a_addr			= await alice_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
		"base": c2_addr,
		"entry": Object.assign( c2, {
		    "text":		"(updated) " + faker.lorem.sentence(),
		}),
	    });
	    log.debug("C2a Address: %s", new ActionHash(c2a_addr) );

	    expect( c2a_addr		).to.be.a("Uint8Array");
	    expect( c2a_addr		).to.have.length( 39 );
	}
    });

    it("should get group content and find: C1a, C2a, C3", async function () {
	const targets			= new Set(
	    (await david_client.call( DNA_NAME, GOOD_ZOME, "get_group_content", {
		"group_id": g1_addr,
	    }))
		.map( pair => pair[0][1] )
		.map( addr => String(new HoloHash(addr)) )
	);
	log.debug("Group content targets: %s", targets );

	const expected_targets	= [
	    c1a_addr,
	    c2a_addr,
	    c3_addr,
	].map( addr => String(new HoloHash(addr)) );
	expect( targets			).to.have.all.keys( ...expected_targets );
	expect( targets			).to.have.lengthOf( expected_targets.length );
    });

    linearSuite( "Phase 1 - Checks", phase1_checks_tests );
}

function phase1_checks_tests () {

    // Static
    it("should reject group update because it requires counter-signing", async function () {
	await expect_reject( async () => {
	    await alice_client.call( DNA_NAME, GOOD_ZOME, "update_group", {
		"base": g1_addr,
		"entry": Object.assign({}, group, {
		    "admins": [ alice_client.agent_id ],
		}),
	    });
	}, "requires counter-signing" ); // group admins cannot be changed without counter-signing
    });

    it("should reject content link because base is not an anchor entry", async function () {
	await expect_reject( async () => {
	    await alice_client.call( DNA_NAME, EVIL_ZOME, "invalid_content_link_base", {
		"base": carol_client.agent_id.retype("EntryHash"),
		"target": new ActionHash( crypto.randomBytes(32) ),
	    });
	}, "has no serialized bytes" );
    });

    it("should reject auth anchor link because base is not a group entry", async function () {
	await expect_reject( async () => {
	    await alice_client.call( DNA_NAME, EVIL_ZOME, "invalid_group_auth_link_base", {
		"base": c1_addr,
		"target": new ActionHash( crypto.randomBytes(32) ),
	    });
	}, "Could not deserialize any-linkable address to expected type: missing field `admins`" );
    });

    it("should reject content link because author does not match auth anchor agent", async function () {
	await expect_reject( async () => {
	    await carol_client.call( DNA_NAME, EVIL_ZOME, "invalid_auth_anchor_link", {
		"group_id": g1_addr,
		"anchor_agent": alice_client.agent_id,
		"target": new ActionHash( crypto.randomBytes(32) ),
	    });
	}, "link based on an auth anchor can only be made by the matching agent" );
    });

    it("should reject content update because the author group cannot be changed", async function () {
	await expect_reject( async () => {
	    await alice_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
		"base": c1_addr,
		"entry": Object.assign({}, c1, {
		    "group_ref": {
			"id": new ActionHash( crypto.randomBytes(32) ),
			"rev": new ActionHash( crypto.randomBytes(32) ),
		    },
		}),
	    });
	}, "group ID cannot be changed" );
    });

    it("should reject content create because author group ID/revision are not related", async function () {
	const g2_id			= await bobby_client.call( DNA_NAME, GOOD_ZOME, "create_group", createGroupInput(
	    [ bobby_client.agent_id ],
	    carol_client.agent_id,
	));
	await expect_reject( async () => {
	    await bobby_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
		"base": c1_addr,
		"entry": Object.assign({}, c1, {
		    "group_ref": {
			"id": g1_addr,
			"rev": g2_id,
		    },
		}),
	    });
	}, "group ID is not the initial action for the group revision" );
    });

    it("should reject auth anchor link because agent (A4) is not in the group's contributors", async function () {
	await expect_reject( async () => {
	    await alice_client.call( DNA_NAME, EVIL_ZOME, "invalid_group_auth_link", {
		"group_id": g1_addr,
		"group_rev": g1_addr,
		"anchor_agent": david_client.agent_id,
	    });
	}, "contributions anchor must match a contributor in the group base" );
    });

    // Dynamic
    it("should reject group update because agent (A3) is not an admin", async function () {
	await expect_reject( async () => {
	    await carol_client.call( DNA_NAME, GOOD_ZOME, "update_group", {
		"base": g1_addr,
		"entry": group,
	    });
	}, "group can only be done by an admin" );
    });

    it("should reject content update because agent is not in the group's contributors", async function () {
	await expect_reject( async () => {
	    await david_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
		"base": c1_addr,
		"entry": Object.assign({}, c1, {
		    "text":		"(updated) " + faker.lorem.sentence(),
		}),
	    });
	}, "not authorized to update content managed by group" );
    });

    it("should reject auth anchor link because agent (A3) is not an admin", async function () {
	await expect_reject( async () => {
	    await carol_client.call( DNA_NAME, EVIL_ZOME, "invalid_group_auth_link", {
		"group_id": g1_addr,
		"group_rev": g1_addr,
		"anchor_agent": alice_client.agent_id,
	    });
	}, "author of a group auth link must be an admin of the base group" );
    });

}


function phase2_tests () {

    it("should update group", async function () {
	group.members			= [
	    bobby_client.agent_id, david_client.agent_id,
	];

	const addr = g1a_addr		= await alice_client.call( DNA_NAME, GOOD_ZOME, "update_group", {
	    "base": g1_addr,
	    "entry": group,
	});
	log.debug("New Group address: %s", addr );

	expect( addr			).to.be.a("Uint8Array");
	expect( addr			).to.have.length( 39 );

	group				= intoStruct( await alice_client.call( DNA_NAME, GOOD_ZOME, "get_group", g1_addr ), GroupStruct );
	log.debug( json.debug( group ) );
    });

    it("should A3 update content (C2 -> C2aa)", async function () {
	c2aa_addr			= await carol_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
	    "base": c2_addr,
	    "entry": Object.assign( c2, {
		"text":	"(updated) " + faker.lorem.sentence(),
	    }),
	});
	log.debug("C2aa Address: %s", new ActionHash(c2aa_addr) );

	expect( c2aa_addr		).to.be.a("Uint8Array");
	expect( c2aa_addr		).to.have.length( 39 );
    });

    it("should A3 update content (C3 -> C3a)", async function () {
	c3a				= {};
	c3a_addr			= await carol_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
	    "base": c3_addr,
	    "entry": Object.assign( c3a, c3, {
		"text":	"(updated) " + faker.lorem.sentence(),
	    }),
	});
	log.debug("C3a Address: %s", new ActionHash(c3a_addr) );

	expect( c3a_addr		).to.be.a("Uint8Array");
	expect( c3a_addr		).to.have.length( 39 );
    });

    it("should A4 update content (C2a -> C2b)", async function () {
	c2b_addr			= await david_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
	    "base": c2a_addr,
	    "entry": Object.assign( c2, {
		"text":	"(updated) " + faker.lorem.sentence(),
		"group_ref": {
		    "id": g1_addr,
		    "rev": g1a_addr,
		},
	    }),
	});
	log.debug("C2b Address: %s", new ActionHash(c2b_addr) );

	let entry			= await carol_client.call( DNA_NAME, GEN_ZOME, "fetch_entry", c2b_addr );
	let decoded			= msgpack.decode( entry.entry );

	c2				= intoStruct( decoded, ContentStruct );

	expect( c2b_addr		).to.be.a("Uint8Array");
	expect( c2b_addr		).to.have.length( 39 );
    });

    it("should A4 create content (C4)", async function () {
	{
	    const content_input		= createContentInput( david_client.agent_id, g1_addr, g1a_addr );
	    c4_addr			= await david_client.call( DNA_NAME, GOOD_ZOME, "create_content", content_input );
	    log.debug("C4 Address: %s", new ActionHash(c4_addr) );

	    expect( c4_addr		).to.be.a("Uint8Array");
	    expect( c4_addr		).to.have.length( 39 );

	    c4				= intoStruct( await alice_client.call( DNA_NAME, GOOD_ZOME, "get_content", {
		"group_id": g1_addr,
		"content_id": c4_addr,
	    }), ContentStruct );
	    log.debug( json.debug( c4 ) );
	}
    });

    it("should get group content and find: C1a, C2b, C3, C4", async function () {
	const targets			= new Set(
	    (await david_client.call( DNA_NAME, GOOD_ZOME, "get_group_content", {
		"group_id": g1_addr,
	    }))
		.map( pair => pair[0][1] )
		.map( addr => String(new HoloHash(addr)) )
	);
	log.debug("Group content targets: %s", targets );

	const expected_targets	= [
	    c1a_addr,
	    c2b_addr,
	    c3_addr,
	    c4_addr,
	].map( addr => String(new HoloHash(addr)) );
	expect( targets			).to.have.all.keys( ...expected_targets );
	expect( targets			).to.have.lengthOf( expected_targets.length );
    });

    it("should get content (C3) latest revision (C3)", async function () {
	{
	    let result			= await carol_client.call( DNA_NAME, GOOD_ZOME, "get_content", {
		"group_id": g1_addr,
		"content_id": c3_addr,
	    });
	    let content			= intoStruct( result, ContentStruct );

	    expect( c3			).to.deep.equal( content );
	}
    });

    linearSuite( "Phase 2 - Checks", phase2_checks_tests );

}

function phase2_checks_tests () {

    // Dynamic
    it("should reject archive content link because agent is not an admin", async function () {
	await expect_reject( async () => {
	    await carol_client.call( DNA_NAME, EVIL_ZOME, "invalid_archive_link", {
		"group_rev": g1a_addr,
		"archived_agent": carol_client.agent_id,
		"target": c2aa_addr,
	    });
	}, "auth archive anchor can only be made by group admins" );
    });

    it("should reject auth anchor link because agent (A3 + A4) is not an admin", async function () {
	await expect_reject( async () => {
	    await carol_client.call( DNA_NAME, EVIL_ZOME, "invalid_group_auth_link", {
		"group_id": g1_addr,
		"group_rev": g1a_addr,
		"anchor_agent": alice_client.agent_id,
	    });
	}, "author of a group auth link must be an admin of the base group" );

	await expect_reject( async () => {
	    await david_client.call( DNA_NAME, EVIL_ZOME, "invalid_group_auth_link", {
		"group_id": g1_addr,
		"group_rev": g1a_addr,
		"anchor_agent": alice_client.agent_id,
	    });
	}, "author of a group auth link must be an admin of the base group" );
    });

    it("should reject content update because agent (A4) did not update the author group revision", async function () {
	await expect_reject( async () => {
	    await david_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
		"base": c2a_addr,
		"entry": Object.assign( {}, c2, {
		    "text":	"(updated) " + faker.lorem.sentence(),
		    "group_ref": {
			"id": g1_addr,
			"rev": g1_addr,
		    },
		}),
	    });
	}, "not authorized to update content managed by group" );
    });

    it("should reject content update because agent (A3) is not a contributor in the author group revision", async function () {
	await expect_reject( async () => {
	    await carol_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
		"base": c2_addr,
		"entry": Object.assign( {}, c2, {
		    "text":	"(updated) " + faker.lorem.sentence(),
		    "group_ref": {
			"id": g1_addr,
			"rev": g1a_addr,
		    },
		}),
	    });
	}, "not authorized to update content managed by group" );
    });

}


function phase3_tests () {

    it("should update group", async function () {
	group.members			= [
	    bobby_client.agent_id, carol_client.agent_id, david_client.agent_id,
	];

	const addr = g1b_addr		= await alice_client.call( DNA_NAME, GOOD_ZOME, "update_group", {
	    "base": g1a_addr,
	    "entry": group,
	});
	log.debug("New Group address: %s", addr );

	expect( addr			).to.be.a("Uint8Array");
	expect( addr			).to.have.length( 39 );

	group				= intoStruct( await alice_client.call( DNA_NAME, GOOD_ZOME, "get_group", g1_addr ), GroupStruct );
	log.debug( json.debug( group ) );
    });

    it("should A3 update content (C4 -> C4a)", async function () {
	c4a_addr			= await carol_client.call( DNA_NAME, GOOD_ZOME, "update_content", {
	    "base": c4_addr,
	    "entry": Object.assign( c4, {
		"text":	"(updated) " + faker.lorem.sentence(),
		"group_ref": {
		    "id": g1_addr,
		    "rev": g1b_addr,
		},
	    }),
	});
	log.debug("C4a Address: %s", new ActionHash(c4a_addr) );

	expect( c4a_addr		).to.be.a("Uint8Array");
	expect( c4a_addr		).to.have.length( 39 );
    });

    it("should create content (C5) via carol (A3)", async function () {
	{
	    const content_input		= createContentInput( carol_client.agent_id, g1_addr, g1b_addr );
	    c5_addr			= await carol_client.call( DNA_NAME, GOOD_ZOME, "create_content", content_input );
	    log.debug("C5 Address: %s", new ActionHash(c5_addr) );

	    expect( c5_addr		).to.be.a("Uint8Array");
	    expect( c5_addr		).to.have.length( 39 );

	    c5				= intoStruct( await alice_client.call( DNA_NAME, GOOD_ZOME, "get_content", {
		"group_id": g1_addr,
		"content_id": c5_addr,
	    }), ContentStruct );
	    log.debug( json.debug( c5 ) );
	}
    });

    it("should get group content and find: C1a, C2b, C3a, C4a, C5", async function () {
	const contents			= (await david_client.call( DNA_NAME, GOOD_ZOME, "get_group_content", {
	    "group_id": g1_addr,
	})).map( ([[origin,latest], content]) => [
	    [ new HoloHash(origin), new HoloHash(latest) ],
	    intoStruct( content, ContentStruct ),
	]);
	const targets			= new Set( contents.map( pair => String(pair[0][1]) ) );
	log.debug("Group content targets: %s", targets );

	const expected_targets	= [
	    c1a_addr,
	    c2b_addr,
	    c3a_addr,
	    c4a_addr,
	    c5_addr,
	].map( addr => String(new HoloHash(addr)) );
	expect( targets			).to.have.all.keys( ...expected_targets );
	expect( targets			).to.have.lengthOf( expected_targets.length );
    });

    it("should get group content using full trace and find: C1a, C2b, C3a, C4a, C5", async function () {
	const targets			= new Set(
	    (await david_client.call( DNA_NAME, GOOD_ZOME, "get_group_content", {
		"group_id": g1_addr,
		"full_trace": true,
	    }))
		.map( pair => pair[0][1] )
		.map( addr => String(new HoloHash(addr)) )
	);
	log.debug("Group content targets: %s", targets );

	const expected_targets	= [
	    c1a_addr,
	    c2b_addr,
	    c3a_addr,
	    c4a_addr,
	    c5_addr,
	].map( addr => String(new HoloHash(addr)) );
	expect( targets			).to.have.all.keys( ...expected_targets );
	expect( targets			).to.have.lengthOf( expected_targets.length );
    });

    it("should get content (C3) latest revision (C3a)", async function () {
	{
	    let result			= await carol_client.call( DNA_NAME, GOOD_ZOME, "get_content", {
		"group_id": g1_addr,
		"content_id": c3_addr,
	    });
	    let content			= intoStruct( result, ContentStruct );

	    expect( c3a			).to.deep.equal( content );
	}
    });

    linearSuite( "Phase 3 - Checks", phase3_checks_tests );
}

function phase3_checks_tests () {

    // Dynamic
    it("should reject auth archive anchor link because base is not a group entry", async function () {
	await expect_reject( async () => {
	    await carol_client.call( DNA_NAME, EVIL_ZOME, "invalid_group_auth_archive_link", {
		"group_rev": c1_addr,
		"anchor_agent": alice_client.agent_id,
	    });
	}, "Could not deserialize any-linkable address to expected type: missing field `admins`" );
    });

    it("should reject auth anchor link delete", async function () {
	await expect_reject( async () => {
	    await alice_client.call( DNA_NAME, EVIL_ZOME, "delete_group_auth_link", {
		"group_id": g1_addr,
		"group_rev": g1_addr,
		"anchor_agent": alice_client.agent_id,
	    });
	}, "group auth links cannot be deleted" );
    });

    it("should reject content link delete because author did not create the link", async function () {
	await expect_reject( async () => {
	    await alice_client.call( DNA_NAME, COOP_ZOME, "delete_group_auth_anchor_content_links", [
		{
		    "group_id": g1_addr,
		    "author": carol_client.agent_id,
		},
		c3_addr,
	    ]);
	}, "contributions anchor can only be deleted" );
    });

    it("should reject content link delete because author is not an admin", async function () {
	await expect_reject( async () => {
	    await carol_client.call( DNA_NAME, COOP_ZOME, "delete_group_auth_anchor_content_links", [
		{
		    "group_id": g1a_addr,
		    "author": carol_client.agent_id,
		    "anchor_type": "archive",
		},
		c3_addr,
	    ]);
	}, "can only be deleted by an admin" );
    });

}


function general_tests () {
	// let evolutions			= await carol_client.call( DNA_NAME, GEN_ZOME, "follow_evolutions", c3_addr );
	// const history			= await Promise.all(
	//     evolutions
	// 	.map( addr => new ActionHash(addr) )
	// 	.map( async addr => {
	// 	    let action		= await carol_client.call( DNA_NAME, GEN_ZOME, "get_action", addr );
	// 	    return [
	// 		new ActionHash(addr),
	// 		intoStruct( action, EntryCreationActionStruct ),
	// 	    ];
	// 	})
	// );
	// console.log( json.debug( history ) );


    it("should trace origin", async function () {
	const result			= await alice_client.call( DNA_NAME, DEBUG_ZOME, "trace_origin", g1a_addr );
	const history			= result.map( ([addr, action]) => [ new ActionHash(addr), intoStruct( action, EntryCreationActionStruct ) ]);
	log.debug("Group history: %s", json.debug( history ) );

	expect( history			).to.have.length( 2 );
    });

    it("should trace evolutions using group authorities", async function () {
	const result			= await alice_client.call( DNA_NAME, DEBUG_ZOME, "follow_evolutions_using_authorities", {
	    "content_id": c2_addr,
	    "authorities": [ ...group.admins, ...group.members ],
	});
	const evolutions		= result.map( addr => new ActionHash(addr) );
	log.debug("Content evolutions: %s", json.debug( evolutions ) );

	expect( evolutions		).to.have.length( 3 );
    });

    it("should trace evolutions using group authorities with exceptions", async function () {
	const result			= await alice_client.call( DNA_NAME, DEBUG_ZOME, "follow_evolutions_using_authorities_with_exceptions", {
	    "content_id": c2_addr,
	    "authorities": [ ...group.admins, ...group.members ],
	    "exceptions": [ c2aa_addr, c3a_addr ],
	});
	const evolutions		= result.map( addr => new ActionHash(addr) );
	log.debug("Content evolutions: %s", json.debug( evolutions ) );

	expect( evolutions		).to.have.length( 3 );
    });

    //
    // Failure checks
    //
    it("should fail because record does not exist", async function () {
	await expect_reject( async () => {
	    await alice_client.call( DNA_NAME, GOOD_ZOME, "get_group", new ActionHash(crypto.randomBytes(32)) );
	}, "Record not found" );
    });

    it("should reject group delete", async function () {
	await expect_reject( async () => {
	    await alice_client.call( DNA_NAME, EVIL_ZOME, "delete_group", g1_addr );
	}, "cannot be deleted" );
    });

}


describe("Model DNA", function () {
    const holochain			= new Holochain({
	"timeout": 60_000,
	"default_stdout_loggers": log.level_rank > 3,
    });

    before(async function () {
	this.timeout( 300_000 );

	const installations		= await holochain.install([
	    "alice", // admin
	    "bobby", // constant member
	    "carol", // member removed later
	    "david", // member added later
	    "emily", // admin
	    "felix", // admin removed later
	], [
	    {
		"app_name": "test",
		"bundle": {
		    [DNA_NAME]:		TEST_DNA_PATH,
		},
	    },
	]);

	app_port			= await holochain.ensureAppPort();

	client				= new AppInterfaceClient( app_port, {
	    "logging": process.env.LOG_LEVEL || "fatal",
	});

	const alice_token		= installations.alice.test.auth.token;
	alice_client			= await client.app( alice_token );

	const bobby_token		= installations.bobby.test.auth.token;
	bobby_client			= await client.app( bobby_token );

	const carol_token		= installations.carol.test.auth.token;
	carol_client			= await client.app( carol_token );

	const david_token		= installations.david.test.auth.token;
	david_client			= await client.app( david_token );

	const emily_token		= installations.emily.test.auth.token;
	emily_client			= await client.app( emily_token );

	const felix_token		= installations.felix.test.auth.token;
	felix_client			= await client.app( felix_token );

	// Must call whoami on each cell to ensure that init has finished.
	{
	    let whoami			= await alice_client.call( DNA_NAME, GOOD_ZOME, "whoami", null, 300_000 );
	    log.normal("Alice whoami: %s", String(new HoloHash( whoami.agent_initial_pubkey )) );
	}
    });

    describe("Group", function () {
	linearSuite( "Phase 1", phase1_tests );
	linearSuite( "Phase 2", phase2_tests );
	linearSuite( "Phase 3", phase3_tests );
    });
    describe("General",			general_tests.bind( this ) );

    after(async () => {
	await holochain.destroy();
    });

});
