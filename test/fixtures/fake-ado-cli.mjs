#!/usr/bin/env node
const [command, ...args] = process.argv.slice(2);

function getFlag(name) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

switch (command) {
  case "config":
    console.log(
      JSON.stringify(
        {
          pat: "abcd****wxyz",
          collectionUrl: "https://dev.azure.com/example",
          project: "Demo",
          repo: "Demo Repo",
          insecure: false,
        },
        null,
        2,
      ),
    );
    break;
  case "repos":
    console.log("repo-1\tCore API");
    console.log("repo-2\tPortal");
    break;
  case "branches":
    console.log("master");
    console.log("develop");
    break;
  case "workitem-get":
    console.log(
      JSON.stringify(
        {
          id: Number(args[0]),
          title: "Fake work item",
          state: "Active",
          type: "Bug",
        },
        null,
        2,
      ),
    );
    break;
  case "workitems-recent":
    console.log("101");
    console.log("102");
    break;
  case "workitem-comments":
    console.log(
      JSON.stringify(
        {
          totalCount: 1,
          comments: [{ id: 77, text: "Looks good" }],
        },
        null,
        2,
      ),
    );
    break;
  case "workitem-comment-add":
    console.log(
      JSON.stringify(
        {
          id: 77,
          workItemId: Number(args[0]),
          text: getFlag("text"),
        },
        null,
        2,
      ),
    );
    break;
  case "workitem-comment-update":
    console.log(
      JSON.stringify(
        {
          id: Number(args[1]),
          workItemId: Number(args[0]),
          text: getFlag("text"),
        },
        null,
        2,
      ),
    );
    break;
  case "prs":
    console.log("#12\t[active]\tImprove docs\t(Clem Bot)");
    console.log("#13\t[completed]\tShip plugin\t(Clem Bot)");
    break;
  case "pr-get":
    console.log(
      JSON.stringify(
        {
          id: Number(args[0]),
          title: "Demo PR",
          status: "active",
        },
        null,
        2,
      ),
    );
    break;
  case "pr-create":
    console.log(`Created PR #321: ${getFlag("title")}`);
    break;
  case "pr-update":
    console.log(`Updated PR #${args[0]}: ${getFlag("title") ?? "unchanged"}`);
    break;
  case "pr-cherry-pick":
    console.log("Cherry-pick of PR #321 completed. Branch created: cherry-pick-321-main");
    break;
  case "pr-approve":
    console.log(`Approved PR #${args[0]} as reviewer reviewer-1`);
    break;
  case "pr-autocomplete":
    console.log(`Enabled auto-complete for PR #${args[0]}`);
    break;
  case "builds":
    console.log("#900\tcompleted/succeeded\tCI\trefs/heads/master");
    break;
  case "smoke":
    console.error("simulated smoke failure");
    process.exit(7);
    break;
  default:
    console.log(
      JSON.stringify(
        {
          command,
          args,
        },
        null,
        2,
      ),
    );
}
