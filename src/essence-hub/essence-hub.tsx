import "azure-devops-ui/Core/override.css";
import "./essence-hub.scss";

import * as SDK from "azure-devops-extension-sdk";
import { WorkItemTrackingProcessRestClient } from "azure-devops-extension-api/WorkItemTrackingProcess";
import { CoreRestClient } from "azure-devops-extension-api/Core";
import { Page } from "azure-devops-ui/Page";
import * as React from "react";
import * as ReactDOM from "react-dom";

import JsonInput from "./components/JsonInput" ;

import { useEffect, useState } from "react";
import { Button } from "azure-devops-ui/Button";
import { CommonServiceIds, IProjectPageService, IVssRestClientOptions } from "azure-devops-extension-api";
import { RestTokenProvider } from "./modules/AuthTokenProvider";
import { AzureFetch } from "./modules/AzureFetch";
import JsonInputTemplate from "./modules/JsonInputTemplate";


async function MigrateToEssenceProcessTemplate(templateId: string, projectId: string, vssRestClientOptions: IVssRestClientOptions) {
  AzureFetch(projectId + "/_apis/wit/projectprocessmigration", "POST", vssRestClientOptions, JSON.stringify( { typeId: templateId} ))
    .then(() => console.log("Migrated to Essence project template"));
}

async function CheckProjectProcess(projectId: string, client: CoreRestClient) {
  const processId: string = await client
    .getProjectProperties(projectId, ["System.ProcessTemplateType"])
    .then(props => props[0].value);

  const process = await client.getProcessById(processId);
  console.log("Current process:", process);
  
  if (process.name == "Essence") {
    return true;
  }
  return false;
}

function Hub() {

  const [vssRestClientOptions, setVssRestClientOptions] = useState<IVssRestClientOptions>({});
  const [coreRestClient, setCoreRestClient] = useState<CoreRestClient>();
  const [processRestClient, setProcessRestClient] = useState<WorkItemTrackingProcessRestClient>();
  const [jsonData, setJsonData] = useState<[JsonInputTemplate]>([new JsonInputTemplate()]);

  useEffect(() => {
    SDK.init().then(() => {
      const host = SDK.getHost();
      console.log("Current host:", host);
      console.log("Root path:", window.location.ancestorOrigins[0]);
      const clientOptions = {
        rootPath: `${window.location.ancestorOrigins[0]}/${host.name}/`,
        authTokenProvider: new RestTokenProvider()
      }
      setVssRestClientOptions(clientOptions);
      setCoreRestClient(new CoreRestClient(clientOptions));
      setProcessRestClient(new WorkItemTrackingProcessRestClient(clientOptions));
    });
  }, []);

  async function HandleProcessMigration() {
    const project = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService)
      .then(service => service.getProject());
    if (project === undefined) {
      console.log("Could not get project info");
      return;
    }

    if (coreRestClient === undefined) {
      console.log("CoreRestClient is not defined");
      return;
    }

    if (await CheckProjectProcess(project.id, coreRestClient)) {
      return;
    }

    const processes = await coreRestClient.getProcesses();
    console.log("Available processes list:", processes);
    const essenceTemplate = processes.find(item => item.name == "Essence");
    if (essenceTemplate === undefined) {
      console.log("Could not find Essence process template")
      return;
    }
    await MigrateToEssenceProcessTemplate(essenceTemplate.id, project.id, vssRestClientOptions);

  }

  function CheckState() {
    console.log(jsonData);
  }

  return (
    <Page>
      <Button
        text="Migrate to Essence process template"
        primary={true}
        onClick={HandleProcessMigration}
      />
      <Button
          text="Check jsonData state"

          onClick={CheckState}
      />
      <JsonInput setJsonData={setJsonData}/>
    </Page>
  );
}

ReactDOM.render(<Hub />, document.getElementById("root"));
