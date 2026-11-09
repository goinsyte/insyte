{
  description = "Insyte — Effect v4 on Cloudflare (bun workspaces)";

  # nixpkgs-unstable, locked in flake.lock as the Effect repo locks it. `nix flake update` moves it; Bun is pinned
  # apart (below), so an update never changes the runtime under the lockfile.
  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";

  outputs = {nixpkgs, ...}: let
    inherit (nixpkgs) lib;

    # Where both Bun and nixpkgs-unstable build: nixpkgs 26.11 dropped Intel Macs (x86_64-darwin), so those use
    # `.bun-version` with Bun's own installer instead of this shell.
    systems = ["aarch64-darwin" "aarch64-linux" "x86_64-linux"];
    forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

    # One Bun for the shell, CI (`setup-bun` reads the same file) and `packageManager`: `.bun-version`. Bumping it
    # means adding its hashes here, from the release's SHASUMS256.txt; evaluation stops until then.
    bunVersion = lib.trim (builtins.readFile ./.bun-version);
    bunBuilds = {
      "1.4.2" = {
        aarch64-darwin = {
          asset = "bun-darwin-aarch64";
          hash = "sha256-kJh6OhbX21VtiGrD1VHnttPt8KHPQ6yu1iLoZ2vh0S8=";
        };
        aarch64-linux = {
          asset = "bun-linux-aarch64";
          hash = "sha256-VDKLvC2cjgyfiSxUTWbFeoO4QTnjSQnl7oF1jxrI/ac=";
        };
        x86_64-linux = {
          asset = "bun-linux-x64";
          hash = "sha256-NjaPrvdSeHXV/6UuU81IAhdB8qg+tiCKjdZAaNQiqRM=";
        };
      };
    };

    # nixpkgs' own Bun derivation (unzip, install, patchelf on Linux), at the release `.bun-version` names.
    bunFor = pkgs: let
      build =
        bunBuilds.${bunVersion}.${pkgs.stdenv.hostPlatform.system}
        or (throw "flake.nix: no Bun ${bunVersion} hashes for ${pkgs.stdenv.hostPlatform.system}; add them to bunBuilds");
    in
      pkgs.bun.overrideAttrs (_: {
        version = bunVersion;
        src = pkgs.fetchurl {
          url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${build.asset}.zip";
          inherit (build) hash;
        };
      });
  in {
    formatter = forAllSystems (pkgs: pkgs.alejandra);

    devShells = forAllSystems (pkgs: {
      # wrangler, workerd, alchemy, dprint, oxlint and lefthook come from the lockfile's devDependencies, not Nix:
      # nixpkgs lags Cloudflare's weekly releases and workerd has no standalone derivation; `bun install` fetches the
      # matching builds. Postgres itself runs in Docker (`bun run db:up`), PG 18 as on Neon; the shell has its client.
      default = pkgs.mkShell {
        packages = with pkgs; [
          (bunFor pkgs)
          nodejs_22 # wrangler, alchemy and vitest-pool-workers run under Node
          python3 # node-gyp
          postgresql_18 # psql, matching compose.yaml and Neon
          gh # PRs, the staging deploy script's variables
          jq
          git
        ];

        shellHook = ''
          echo "insyte dev shell · bun $(bun --version) · node $(node --version) · psql $(psql --version | cut -d' ' -f3)"
          echo "  bun install · bun run db:up · bun run dev"
        '';
      };
    });
  };
}
