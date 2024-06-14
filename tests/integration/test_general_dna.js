import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-general-dna", process.env.LOG_LEVEL );

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
const TEST_DNA_PATH			= path.join( __dirname, "../general_dna.dna" );

const DNA_NAME				= "test_dna";

const GEN_ZOME				= "general_csr";
const COOP_ZOME				= "coop_content_csr";


let app_port;
let client;
let alice_client;
let bobby_client;
let group, g1_addr;


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

}


describe("General DNA", function () {
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
	    let whoami			= await alice_client.call( DNA_NAME, GEN_ZOME, "whoami", null, 300_000 );
	    log.normal("Alice whoami: %s", String(new HoloHash( whoami.agent_initial_pubkey )) );
	}
    });

    describe("Group", function () {
	linearSuite( "Basic", basic_tests );
    });

    after(async () => {
	await holochain.destroy();
    });

});
