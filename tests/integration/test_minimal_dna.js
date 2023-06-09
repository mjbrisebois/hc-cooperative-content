import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-minimal-dna", process.env.LOG_LEVEL );

import fs				from 'node:fs';
import path				from 'path';
import crypto				from 'crypto';
import { expect }			from 'chai';
import { faker }			from '@faker-js/faker';
import msgpack				from '@msgpack/msgpack';
import json				from '@whi/json';
import { AgentPubKey, HoloHash,
	 ActionHash, EntryHash }	from '@whi/holo-hash';
import HolochainBackdrop		from '@whi/holochain-backdrop';
const { Holochain }			= HolochainBackdrop;
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
const TEST_DNA_PATH			= path.join( __dirname, "../minimal_dna.dna" );

const clients				= {};
const DNA_NAME				= "test_dna";

const COOP_ZOME				= "coop_content_csr";


let group, g1_addr, g1a_addr;
let c1_addr				= new EntryHash( crypto.randomBytes(32) );
let c1a_addr				= new EntryHash( crypto.randomBytes(32) );


function basic_tests () {

    it("should create group via alice (A1)", async function () {
	const group_input		= createGroupInput(
	    [ clients.alice.cellAgent() ],
	    clients.bobby.cellAgent(),
	);
	g1_addr				= await clients.alice.call( DNA_NAME, COOP_ZOME, "create_group", group_input );
	log.debug("Group ID: %s", g1_addr );

	expect( g1_addr		).to.be.a("Uint8Array");
	expect( g1_addr		).to.have.length( 39 );

	group				= intoStruct( await clients.alice.call( DNA_NAME, COOP_ZOME, "get_group", g1_addr ), GroupStruct );
	log.debug( json.debug( group ) );
    });

    it("should update group", async function () {
	group.members			= [];

	const addr = g1a_addr		= await clients.alice.call( DNA_NAME, COOP_ZOME, "update_group", {
	    "base": g1_addr,
	    "entry": group,
	});
	log.debug("New Group address: %s", addr );

	expect( addr			).to.be.a("Uint8Array");
	expect( addr			).to.have.length( 39 );

	group				= intoStruct( await clients.alice.call( DNA_NAME, COOP_ZOME, "get_group", g1_addr ), GroupStruct );
	log.debug( json.debug( group ) );
    });

    it("should get group", async function () {
	group				= intoStruct( await clients.alice.call( DNA_NAME, COOP_ZOME, "get_group", g1_addr ), GroupStruct );
	log.debug( json.debug( group ) );
    });

    it("should create content link", async function () {
	await clients.alice.call( DNA_NAME, COOP_ZOME, "create_content_link", {
	    "group_id": g1_addr,
	    "content_target": c1_addr,
	});
    });

    it("should get all group content", async function () {
	const result			= await clients.alice.call( DNA_NAME, COOP_ZOME, "get_group_content_latest", {
	    "group_id": g1_addr,
	    "content_id": c1_addr,
	});
	const latest			= new EntryHash( result );
	log.debug("Latest address for C1: %s", latest );

	expect( latest			).to.deep.equal( c1_addr );
    });

    it("should create content update link", async function () {
	await clients.alice.call( DNA_NAME, COOP_ZOME, "create_content_update_link", {
	    "group_id": g1_addr,
	    "content_id": c1_addr,
	    "content_prev": c1_addr,
	    "content_next": c1a_addr,
	});
    });

    it("should get all group content", async function () {
	const result			= await clients.alice.call( DNA_NAME, COOP_ZOME, "get_group_content_latest", {
	    "group_id": g1_addr,
	    "content_id": c1_addr,
	});
	const latest			= new EntryHash( result );
	log.debug("Latest address for C1: %s", latest );

	expect( latest			).to.deep.equal( c1a_addr );
    });

}


function accesssory_tests () {

    it("should calculate group auth anchor hash", async function () {
	let anchor_hash			= await clients.carol.call( DNA_NAME, COOP_ZOME, "group_auth_anchor_hash", {
	    "group_id": g1_addr,
	    "author": clients.alice.cellAgent(),
	});

	new EntryHash( anchor_hash );
    });

    it("should calculate group auth archive anchor hash", async function () {
	let anchor_hash			= await clients.carol.call( DNA_NAME, COOP_ZOME, "group_auth_archive_anchor_hash", {
	    "group_id": g1_addr,
	    "author": clients.alice.cellAgent(),
	});

	new EntryHash( anchor_hash );
    });

}


function error_tests () {
}


describe("Minimal DNA", function () {
    const holochain			= new Holochain({
	"timeout": 60_000,
	"default_stdout_loggers": process.env.LOG_LEVEL === "trace",
    });

    before(async function () {
	this.timeout( 300_000 );

	const actors			= await holochain.backdrop({
	    "test_happ": {
		[DNA_NAME]:		TEST_DNA_PATH,
	    },
	}, {
	    "actors": [
		"alice",
		"bobby",
	    ],
	});

	for ( let name in actors ) {
	    for ( let app_prefix in actors[ name ] ) {
		log.info("Upgrade client for %s => %s", name, app_prefix );
		const client		= clients[ name ]	= actors[ name ][ app_prefix ].client;
	    }
	}

	// Must call whoami on each cell to ensure that init has finished.
	{
	    let whoami			= await clients.alice.call( DNA_NAME, COOP_ZOME, "whoami", null, 300_000 );
	    log.normal("Alice whoami: %s", String(new HoloHash( whoami.agent_initial_pubkey )) );
	}
    });

    describe("Group", function () {
	linearSuite( "Basic", basic_tests );
	// linearSuite( "Error", error_tests );
    });

    after(async () => {
	await holochain.destroy();
    });

});
