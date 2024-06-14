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
const TEST_DNA_PATH			= path.join( __dirname, "../minimal_dna.dna" );

const DNA_NAME				= "test_dna";

const COOP_ZOME				= "coop_content_csr";


let app_port;
let client;
let alice_client;
let bobby_client;
let group, g1_addr, g1a_addr;
let c1_addr				= new EntryHash( crypto.randomBytes(32) );
let c1a_addr				= new EntryHash( crypto.randomBytes(32) );


function basic_tests () {

    it("should create group via alice (A1)", async function () {
	const group_input		= createGroupInput(
	    [ alice_client.agent_id ],
	    bobby_client.agent_id,
	);
	g1_addr				= await alice_client.call( DNA_NAME, COOP_ZOME, "create_group", group_input );
	log.debug("Group ID: %s", g1_addr );

	expect( g1_addr		).to.be.a("Uint8Array");
	expect( g1_addr		).to.have.length( 39 );

	group				= intoStruct( await alice_client.call( DNA_NAME, COOP_ZOME, "get_group", g1_addr ), GroupStruct );
	log.debug( json.debug( group ) );
    });

    it("should update group", async function () {
	group.members			= [];

	const addr = g1a_addr		= await alice_client.call( DNA_NAME, COOP_ZOME, "update_group", {
	    "base": g1_addr,
	    "entry": group,
	});
	log.debug("New Group address: %s", addr );

	expect( addr			).to.be.a("Uint8Array");
	expect( addr			).to.have.length( 39 );

	group				= intoStruct( await alice_client.call( DNA_NAME, COOP_ZOME, "get_group", g1_addr ), GroupStruct );
	log.debug( json.debug( group ) );
    });

    it("should get group", async function () {
	group				= intoStruct( await alice_client.call( DNA_NAME, COOP_ZOME, "get_group", g1_addr ), GroupStruct );
	log.debug( json.debug( group ) );
    });

    it("should create content link", async function () {
	await alice_client.call( DNA_NAME, COOP_ZOME, "create_content_link", {
	    "group_id": g1_addr,
	    "content_target": c1_addr,
	});
    });

    it("should get all group content", async function () {
	const result			= await alice_client.call( DNA_NAME, COOP_ZOME, "get_group_content_latest", {
	    "group_id": g1_addr,
	    "content_id": c1_addr,
	});
	const latest			= new EntryHash( result );
	log.debug("Latest address for C1: %s", latest );

	expect( latest			).to.deep.equal( c1_addr );
    });

    it("should create content update link", async function () {
	await alice_client.call( DNA_NAME, COOP_ZOME, "create_content_update_link", {
	    "group_id": g1_addr,
	    "content_id": c1_addr,
	    "content_prev": c1_addr,
	    "content_next": c1a_addr,
	});
    });

    it("should get all group content", async function () {
	const result			= await alice_client.call( DNA_NAME, COOP_ZOME, "get_group_content_latest", {
	    "group_id": g1_addr,
	    "content_id": c1_addr,
	});
	const latest			= new EntryHash( result );
	log.debug("Latest address for C1: %s", latest );

	expect( latest			).to.deep.equal( c1a_addr );
    });

    it("should get evolution history for for a group content", async function () {
	const evolutions		= (await alice_client.call( DNA_NAME, COOP_ZOME, "get_group_content_evolutions", {
	    "group_id": g1_addr,
	    "content_id": c1_addr,
	})).map( hash => new EntryHash(hash) );
	log.debug("Evolutions for C1: %s", json.debug( evolutions ) );

	expect( evolutions[0]		).to.deep.equal( c1_addr );
	expect( evolutions[1]		).to.deep.equal( c1a_addr );
	expect( evolutions		).to.have.length( 2 );
    });

}


function error_tests () {
}


describe("Minimal DNA", function () {
    const holochain			= new Holochain({
	"timeout": 60_000,
	"default_stdout_loggers": log.level_rank > 3,
    });

    before(async function () {
	this.timeout( 300_000 );

	const installations		= await holochain.install([
	    "alice",
	    "bobby",
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

	// Must call whoami on each cell to ensure that init has finished.
	{
	    let whoami			= await alice_client.call( DNA_NAME, COOP_ZOME, "whoami", null, 300_000 );
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
