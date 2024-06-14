import { AgentPubKey, HoloHash,
	 ActionHash, EntryHash }	from '@spartan-hc/holo-hash';
import {
    OptionType, VecType, MapType,
}					from '@whi/into-struct';


export const EntryCreationActionStruct = {
    "type":			String,
    "author":			AgentPubKey,
    "timestamp":		Number,
    "action_seq":		Number,
    "prev_action":		ActionHash,
    "original_action_address":	OptionType( ActionHash ),
    "original_entry_address":	OptionType( EntryHash ),
    "entry_type": {
	"App": {
	    "entry_index":	Number,
	    "zome_index":	Number,
	    "visibility":	"Public",
	},
    },
    "entry_hash":		EntryHash,
    "weight": {
	"bucket_id":		Number,
	"units":		Number,
	"rate_bytes":		Number,
    },
};

export const GroupStruct = {
    "admins":			VecType( AgentPubKey ),
    "members":			VecType( AgentPubKey ),

    "published_at":		Number,
    "last_updated":		Number,
    "metadata":			{},
};

export const ContentStruct = {
    "text":			String,
    "author":			AgentPubKey,
    "group_ref":		{
	"id": ActionHash,
	"rev": ActionHash,
    },

    "published_at":		Number,
    "last_updated":		Number,
};

export default {
    EntryCreationActionStruct,
    GroupStruct,
    ContentStruct,
};
