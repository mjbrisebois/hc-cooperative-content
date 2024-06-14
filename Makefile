
.PHONY:			FORCE
SHELL			= bash
TARGET			= release
TARGET_DIR		= target/wasm32-unknown-unknown/release
SOURCE_FILES		= Makefile zomes/Cargo.* zomes/*/Cargo.toml zomes/*/src/*.rs zomes/*/src/*/* \
				coop_content_sdk/Cargo.toml coop_content_sdk/src/*.rs

# Zomes (WASM)
COOP_CONTENT_WASM	= zomes/coop_content.wasm
COOP_CONTENT_CSR_WASM	= zomes/coop_content_csr.wasm


#
# Project
#
tests/package-lock.json:	tests/package.json
	touch $@
tests/node_modules:		tests/package-lock.json
	cd tests; \
	npm install
	touch $@
clean:
	rm -rf \
	    tests/node_modules \
	    .cargo \
	    target

rebuild:			clean build
build:				$(COOP_CONTENT_WASM) $(COOP_CONTENT_CSR_WASM)

zomes/%.wasm:			zomes/$(TARGET_DIR)/%.wasm
	@echo -e "\x1b[38;2mCopying WASM ($<) to 'zomes' directory: $@\x1b[0m"; \
	cp $< $@
zomes/$(TARGET_DIR)/%.wasm:	$(SOURCE_FILES)
	rm -f zomes/$*.wasm
	@echo -e "\x1b[37mBuilding zome '$*' -> $@\x1b[0m"; \
	cd zomes; \
	RUST_BACKTRACE=1 CARGO_TARGET_DIR=target cargo build --release \
	    --target wasm32-unknown-unknown \
	    --package $*
	@touch $@ # Cargo must have a cache somewhere because it doesn't update the file time

npm-reinstall-local:
	cd tests; npm uninstall $(NPM_PACKAGE); npm i --save $(LOCAL_PATH)
npm-reinstall-public:
	cd tests; npm uninstall $(NPM_PACKAGE); npm i --save $(NPM_PACKAGE)

npm-use-app-interface-client-public:
npm-use-app-interface-client-local:
npm-use-app-interface-client-%:
	NPM_PACKAGE=@spartan-hc/app-interface-client LOCAL_PATH=../../app-interface-client-js make npm-reinstall-$*

npm-use-backdrop-public:
npm-use-backdrop-local:
npm-use-backdrop-%:
	NPM_PACKAGE=@spartan-hc/holochain-backdrop LOCAL_PATH=../../node-holochain-backdrop make npm-reinstall-$*



#
# Packages
#
.cargo/credentials:
	cp ~/$@ $@

preview-types-crate:
	DEBUG_LEVEL=debug make -s test
	cd coop_content_types; cargo publish --dry-run --allow-dirty
	touch coop_content_types/src/lib.rs
publish-types-crate:		.cargo/credentials
	DEBUG_LEVEL=debug make -s test
	cd coop_content_types; cargo publish
	touch coop_content_types/src/lib.rs

preview-sdk-crate:
	DEBUG_LEVEL=debug make -s test
	cd coop_content_sdk; cargo publish --dry-run --allow-dirty
	touch coop_content_sdk/src/lib.rs
publish-sdk-crate:		.cargo/credentials
	DEBUG_LEVEL=debug make -s test
	cd coop_content_sdk; cargo publish
	touch coop_content_sdk/src/lib.rs



#
# Testing
#
DEBUG_LEVEL	       ?= warn
TEST_ENV_VARS		= LOG_LEVEL=$(DEBUG_LEVEL)
MOCHA_OPTS		= -n enable-source-maps

reset:
	rm -f zomes/*.wasm
	rm -f tests/*.dna
	rm -f tests/zomes/*.wasm
tests/%.dna:			build FORCE
	cd tests; make $*.dna
test-setup:			tests/node_modules

test:
	make -s test-unit
	make -s test-integration

test-unit:			test-unit-coop_content
test-unit-%:
	cd zomes;		RUST_BACKTRACE=1 cargo test $* -- --nocapture

test-integration:
	make -s test-setup
	make -s test-general
	make -s test-minimal
	make -s test-external
	make -s test-model

GENERAL_DNA			= tests/general_dna.dna
MINIMAL_DNA			= tests/minimal_dna.dna
MODEL_DNA			= tests/model_dna.dna
TEST_DNAS			= $(GENERAL_DNA) $(MINIMAL_DNA) $(MODEL_DNA)

test-general:			test-setup build $(GENERAL_DNA)
	cd tests; $(TEST_ENV_VARS) npx mocha $(MOCHA_OPTS) integration/test_general_dna.js
test-minimal:			test-setup build $(MINIMAL_DNA)
	cd tests; $(TEST_ENV_VARS) npx mocha $(MOCHA_OPTS) integration/test_minimal_dna.js
test-external:			test-setup build $(MINIMAL_DNA)
	cd tests; $(TEST_ENV_VARS) npx mocha $(MOCHA_OPTS) integration/test_minimal_external_pointers.js
test-model:			test-setup build $(TEST_DNAS)
	cd tests; $(TEST_ENV_VARS) npx mocha $(MOCHA_OPTS) integration/test_model_dna.js



#
# Repository
#
clean-remove-chaff:
	@find . -name '*~' -exec rm {} \;
clean-files:		clean-remove-chaff
	git clean -nd
clean-files-force:	clean-remove-chaff
	git clean -fd
clean-files-all:	clean-remove-chaff
	git clean -ndx
clean-files-all-force:	clean-remove-chaff
	git clean -fdx

PRE_HDIE_VERSION = whi_hdi_extensions = "0.7"
NEW_HDIE_VERSION = whi_hdi_extensions = "0.8.1"

PRE_HDKE_VERSION = whi_hdk_extensions = "0.7"
NEW_HDKE_VERSION = whi_hdk_extensions = "0.8.1"

GG_REPLACE_LOCATIONS = ':(exclude)*.lock' zomes/*/ *_types/ *_sdk/ tests/zomes

update-hdk-extensions-version:
	git grep -l '$(PRE_HDKE_VERSION)' -- $(GG_REPLACE_LOCATIONS) | xargs sed -i 's|$(PRE_HDKE_VERSION)|$(NEW_HDKE_VERSION)|g'
update-hdi-extensions-version:
	git grep -l '$(PRE_HDIE_VERSION)' -- $(GG_REPLACE_LOCATIONS) | xargs sed -i 's|$(PRE_HDIE_VERSION)|$(NEW_HDIE_VERSION)|g'
reset-locks:
	rm -f zomes/Cargo.lock
	rm -f tests/zomes/Cargo.lock


#
# Documentation
#
TYPES_DOCS		= target/doc/coop_content_types/index.html
SDK_DOCS		= target/doc/coop_content_sdk/index.html
COOP_DOCS		= target/doc/coop_content/index.html

$(TYPES_DOCS):		coop_content_types/src/**
	cd coop_content_types; cargo test --doc
	cd zomes; cargo doc
	touch coop_content_types/src/lib.rs
	@echo -e "\x1b[37mOpen docs in file://$(shell pwd)/$(TYPES_DOCS)\x1b[0m";
$(SDK_DOCS):		coop_content_sdk/src/**
	cd coop_content_sdk; cargo test --doc
	cd zomes; cargo doc
	touch coop_content_sdk/src/lib.rs
	@echo -e "\x1b[37mOpen docs in file://$(shell pwd)/$(SDK_DOCS)\x1b[0m";
$(COOP_DOCS):		zomes/*/src/**
	cd zomes; cargo test --doc
	cd zomes; cargo doc
	@echo -e "\x1b[37mOpen docs in file://$(shell pwd)/$(COOP_DOCS)\x1b[0m";
docs:			$(SDK_DOCS) $(COOP_DOCS)
docs-watch:
	@inotifywait -r -m -e modify		\
		--includei '.*\.rs'		\
			zomes/			\
			coop_content_sdk	\
	| while read -r dir event file; do	\
		echo -e "\x1b[37m$$event $$dir$$file\x1b[0m";\
		make docs;			\
	done
