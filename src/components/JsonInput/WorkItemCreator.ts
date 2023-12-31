// Учитывать блокировку и иерархию.


import JsonInputTemplate, {
    Activity,
    Alpha,
    AlphaContainment, AlphaCriterion,
    Checkpoint, LevelOfDetail,
    State,
    WorkProduct, WorkProductCriterion, WorkProductManifest
} from "../../modules/JsonInputTemplate";
import {AzureFetch} from "../../modules/AzureFetch";
import {ProjectData} from "./JsonInput";
import {WorkItemRelation} from "azure-devops-extension-api/WorkItemTracking";
import {getKeywordSearchResults} from "azure-devops-ui/Filter";

interface WIRequestBodyData {
    op?: string | null,
    path: string,
    from?: string | null,
    value: any
}

function clearWorkItems() {
    //clean alphas
}


export async function createWorkItems(dataCollection: [JsonInputTemplate], projectData: ProjectData) {
    //TODO: Remove location param, and get there
    const alphaName: string = "Essence Alpha";
    const subAlphaDefinition: string = "Essence SubAlphaDefinition";

    async function createAlphas(alphas: [Alpha] | undefined, alphaContainments: [AlphaContainment] | undefined): Promise<[Alpha] | undefined> {

        if (alphas === undefined || alphaContainments === undefined) return; //TODO:check how it works without subalphas (alphaContainments.length=0)

        let alphasLeft = alphas.length;
        let prevAlpha = -1;
        console.log(alphasLeft)
        while (alphasLeft > 0 && prevAlpha !== alphasLeft) {// do while
            prevAlpha = alphasLeft

            for (let alpha of alphas) {
                console.log(alpha)

                if (alpha.WIId != null) {
                    continue;
                }
                if (alpha.parentAlphaId != null && alphas.find(a => a.id === alpha.parentAlphaId)?.WIId == null)// && alpha's WIId ==null -> skip
                {
                    continue;
                }

                let title = CreateRequestBodyWIObject({path: "/fields/Title", value: `${alpha.name}`})
                let description = CreateRequestBodyWIObject({
                    path: "/fields/Description",
                    value: `${alpha.description}`
                })
                let bodyRequest: WIRequestBodyData[] = [title, description];
                let WITName: string = alphaName;
                if (alpha.parentAlphaId != null) {
                    WITName = subAlphaDefinition;
                    let parentAlpha = alphas.find(a => a.id === alpha.parentAlphaId);
                    let parentReferenceValue: WorkItemRelation = {
                        attributes: {
                            isLocked: false,
                            comment: `${alpha.name} is a SubAlphaDefinition of Alpha ${parentAlpha?.name}`,
                            name: 'Parent'
                        },
                        rel: 'System.LinkTypes.Hierarchy-Reverse',
                        url: `${projectData.vssRestClientOptions.rootPath}${projectData.projectId}/_apis/wit/wokrItems/${parentAlpha?.WIId}`

                    };
                    let parentReference = CreateRequestBodyWIObject({
                        path: "/relations/System.LinkTypes.Hierarchy-Reverse",
                        value: parentReferenceValue
                    })

                    let alphaContainment = alphaContainments.find(a => a.subAlphaId === alpha.id && a.supAlphaId === alpha.parentAlphaId);
                    console.log(alphaContainment)
                    if (alphaContainment == null) {
                        console.log(`alphaContainment for subAlpha was not found`)
                    }

                    let lowerBound = CreateRequestBodyWIObject({
                        path: "/fields/Lower Bound",
                        value: alphaContainment!.lowerBound
                    });

                    let normalValue = CreateRequestBodyWIObject({
                        path: "/fields/Normal Value",
                        value: alphaContainment?.normalValue
                    });
                    let upperBound = CreateRequestBodyWIObject({
                        path: "/fields/Upper Bound",
                        value: alphaContainment!.upperBound
                    });


                    bodyRequest.push(parentReference, lowerBound, normalValue, upperBound)

                }

                //console.log(bodyRequest);


                alpha.WIId = await CreateWIFetch(bodyRequest, WITName)

                alphasLeft--;


            }
        }
        return alphas;

    }

    async function createStates(states: [State] | undefined, alphas: [Alpha] | undefined): Promise<[State] | undefined> {
        if (states === undefined || alphas === undefined) return;
        let stateName: string = "Essence State"

        console.log("create states")
        for (let state of states) {
            let title = CreateRequestBodyWIObject({path: "/fields/Title", value: `${state.name}`});
            let descriptionValue = state.description;
            if (descriptionValue === '') descriptionValue = "empty description"//TODO:Fix it in some way
            let description = CreateRequestBodyWIObject({
                path: "/fields/Description",
                value: `${descriptionValue}`
            })
            let order = CreateRequestBodyWIObject({path: "/fields/Order", value: state.order});

            let parentAlpha = alphas.find(a => a.id === state.alphaId);
            let alphaReferenceValue: WorkItemRelation = {
                attributes: {
                    isLocked: false,
                    comment: `${state.name} is a state of Alpha ${parentAlpha?.name}`,
                    name: 'Parent'
                },
                rel: 'System.LinkTypes.Hierarchy-Reverse',
                url: `${projectData.vssRestClientOptions.rootPath}${projectData.projectId}/_apis/wit/wokrItems/${parentAlpha?.WIId}`

            };
            let alphaReference = CreateRequestBodyWIObject({
                path: "/relations/System.LinkTypes.Hierarchy-Reverse",
                value: alphaReferenceValue
            })

            let bodyRequest: WIRequestBodyData[] = [title, description, order, alphaReference];


            if (state.specialId != null) {
                let specialId = CreateRequestBodyWIObject({
                    path: "/fields/HITS.Essence.SpecialId",
                    value: state.specialId
                })
                bodyRequest.push(specialId);
            }

            //console.log(bodyRequest);

            state.WIId = await CreateWIFetch(bodyRequest, stateName);
            //Create and save WIId

        }
        return states;
    }


    async function createCheckpoints(checkpoints: [Checkpoint] | undefined, states: [State] | undefined, levelOfDetails: [LevelOfDetail] | undefined) {
        if (checkpoints === undefined || states === undefined || levelOfDetails === undefined) return;


        let checkpointName: string = "Essence Checkpoint"
        //detailId - stateId
        for (let checkpoint of checkpoints) {
            let message: string = "state";
            let parentState: State | undefined | LevelOfDetail = states.find(s => s.id === checkpoint.detailId);
            if (parentState == null) {
                parentState = levelOfDetails.find(l => l.id === checkpoint.detailId);
                message = "levelOfDetail"
            }

            let title = CreateRequestBodyWIObject({path: "/fields/Title", value: `${checkpoint.name}`});
            let descriptionValue = checkpoint.description;
            if (descriptionValue === '') descriptionValue = "empty description"
            let description = CreateRequestBodyWIObject({
                path: "/fields/Description",
                value: `${descriptionValue}`
            })
            let order = CreateRequestBodyWIObject({path: "/fields/Order", value: checkpoint.order});
            let degreeOfEvidenceValue = CreateRequestBodyWIObject({
                path: "/fields/DegreeOfEvidence Value",
                value: checkpoint.degreeOfEvidenceEnumValueManagerOpinion
            })

            let
                ReferenceValue: WorkItemRelation = {
                    attributes: {
                        isLocked: false,
                        comment: `${checkpoint.name} is a checkpoint of ${message} ${parentState?.name}`,
                        name: 'Parent'
                    },
                    rel: 'System.LinkTypes.Hierarchy-Reverse',
                    url: `${projectData.vssRestClientOptions.rootPath}${projectData.projectId}/_apis/wit/wokrItems/${parentState?.WIId}`

                };
            let Reference = CreateRequestBodyWIObject({
                path: "/relations/System.LinkTypes.Hierarchy-Reverse",
                value: ReferenceValue
            })

            let bodyRequest: WIRequestBodyData[] = [title, description, order, Reference, degreeOfEvidenceValue];
            checkpoint.WIId = await CreateWIFetch(bodyRequest, checkpointName);

        }
        return checkpoints;
    }

    async function createWorkProductDefinitions(workProducts: [WorkProduct] | undefined, workProductManifests: [WorkProductManifest] | undefined, alphas: [Alpha] | undefined) {
        if (workProducts === undefined || workProductManifests === undefined || alphas === undefined) return;
        let workProductName = "Essence WorkProductDefinition"

        for (let workProduct of workProducts) {
            let title = CreateRequestBodyWIObject({path: "/fields/Title", value: `${workProduct.name}`});
            let description = CreateRequestBodyWIObject({
                path: "/fields/Description",
                value: `${workProduct.description}`
            })

            let workProductManifest = workProductManifests.find(w => w.workProductId === workProduct.id);

            let lowerBound = CreateRequestBodyWIObject({
                path: "/fields/Lower Bound",
                value: workProductManifest!.lowerBound
            });
            let upperBound = CreateRequestBodyWIObject({
                path: "/fields/Upper Bound",
                value: workProductManifest!.upperBound
            });
            let normalValue=CreateRequestBodyWIObject({
                path:"/fields/Normal Value",
                value:workProductManifest!.normalValue
            })

            let parentAlpha = alphas.find(a => a.id === workProductManifest?.alphaId);
            let alphaReferenceValue: WorkItemRelation = {
                attributes: {
                    isLocked: false,
                    comment: `${workProduct.name} is a workProductDefinition of Alpha ${parentAlpha?.name}`,
                    name: 'Parent'
                },
                rel: 'System.LinkTypes.Hierarchy-Reverse',
                url: `${projectData.vssRestClientOptions.rootPath}${projectData.projectId}/_apis/wit/wokrItems/${parentAlpha?.WIId}`

            };
            let alphaReference = CreateRequestBodyWIObject({
                path: "/relations/System.LinkTypes.Hierarchy-Reverse",
                value: alphaReferenceValue
            })

            let bodyRequest: WIRequestBodyData[] = [title, description, lowerBound, upperBound, alphaReference,normalValue];

            workProduct.WIId = await CreateWIFetch(bodyRequest, workProductName);

        }

        return workProducts;
    }

    async function createActivities(activities: [Activity] | undefined) {
        if (activities === undefined) return;
        let activityName = "Essence Activity"
        for (let activity of activities) {
            let title = CreateRequestBodyWIObject({path: "/fields/Title", value: `${activity.name}`});
            let description = CreateRequestBodyWIObject({
                path: "/fields/Description",
                value: `${activity.description}`
            })
            let bodyRequest: WIRequestBodyData[] = [title, description];
            activity.WIId = await CreateWIFetch(bodyRequest, activityName);
        }


        return activities;
    }

    async function createLevelOfDetails(levelOfDetails: [LevelOfDetail] | undefined, workProducts: [WorkProduct] | undefined) {
        if (levelOfDetails === undefined || workProducts === undefined) return;
        let levelOfDetailsName = "Essence LevelOfDetail"
        for (let levelOfDetail of levelOfDetails) {
            let title = CreateRequestBodyWIObject({path: "/fields/Title", value: `${levelOfDetail.name}`});
            let description = CreateRequestBodyWIObject({
                path: "/fields/Description",
                value: `${levelOfDetail.description}`
            })
            let order = CreateRequestBodyWIObject({
                path: "/fields/Order",
                value: `${levelOfDetail.order}`
            })

            let parentWorkProduct = workProducts.find(w => w.id === levelOfDetail.workProductId);
            let WorkProductReferenceValue: WorkItemRelation = {
                attributes: {
                    isLocked: false,
                    comment: `${levelOfDetail.name} is a LevelOfDetail of WorkProductDefinition ${parentWorkProduct?.name}`,
                    name: 'Parent'
                },
                rel: 'System.LinkTypes.Hierarchy-Reverse',
                url: `${projectData.vssRestClientOptions.rootPath}${projectData.projectId}/_apis/wit/wokrItems/${parentWorkProduct?.WIId}`

            };
            let alphaReference = CreateRequestBodyWIObject({
                path: "/relations/System.LinkTypes.Hierarchy-Reverse",
                value: WorkProductReferenceValue
            })

            let bodyRequest: WIRequestBodyData[] = [title, description, order, alphaReference];

            levelOfDetail.WIId = await CreateWIFetch(bodyRequest, levelOfDetailsName);
        }

        return levelOfDetails;
    }

    async function createWorkProductCriterions(workProductCriterions: [WorkProductCriterion] | undefined, activities: [Activity] | undefined, levelOfDetails: [LevelOfDetail] | undefined) {
        if (workProductCriterions === undefined || activities === undefined || levelOfDetails === undefined) return;
        let workProductCriterionsName = "Essence WorkProductCriterion";
        for (let workProductCriterion of workProductCriterions) {
            let title = CreateRequestBodyWIObject({path: "/fields/Title", value: 'workProductCriterion'});
            let type = CreateRequestBodyWIObject({
                path: "/fields/Type",
                value: `${workProductCriterion.criterionTypeEnumValue}`
            });
            let partial = CreateRequestBodyWIObject({
                path: "/fields/IsPartial",
                value: `${workProductCriterion.partial}`
            });
            let minimal = CreateRequestBodyWIObject({
                path: "/fields/Minimal",
                value: `${workProductCriterion.minimal}`
            });

            let duplicateLevelOfDetail = levelOfDetails.find(l => l.id === workProductCriterion.levelOfDetailId);
            let levelOfDetailReferenceValue: WorkItemRelation = {
                attributes: {
                    isLocked: false,
                    comment: `workProductCriterion is a duplicate of levelOfDetail ${duplicateLevelOfDetail?.name}`,
                    name: 'Duplicate Of'
                },
                rel: 'System.LinkTypes.Duplicate-Reverse',
                url: `${projectData.vssRestClientOptions.rootPath}${projectData.projectId}/_apis/wit/wokrItems/${duplicateLevelOfDetail?.WIId}`

            };
            let levelOfDetailReference = CreateRequestBodyWIObject({
                path: "/relations/System.LinkTypes.Duplicate-Reverse",
                value: levelOfDetailReferenceValue
            });

            let parentActivity = activities.find(a => a.id === workProductCriterion.activityId);
            let activityReferenceValue: WorkItemRelation = {
                attributes: {
                    isLocked: false,
                    comment: `workProductCriterion is a child of Activity ${parentActivity?.name}`,
                    name: 'Parent'
                },
                rel: 'System.LinkTypes.Hierarchy-Reverse',
                url: `${projectData.vssRestClientOptions.rootPath}${projectData.projectId}/_apis/wit/wokrItems/${parentActivity?.WIId}`

            };
            let activityReference = CreateRequestBodyWIObject({
                path: "/relations/System.LinkTypes.Hierarchy-Reverse",
                value: activityReferenceValue
            });
            let bodyRequest: WIRequestBodyData[] = [title, type, partial, minimal, levelOfDetailReference, activityReference];
            workProductCriterion.WIId = await CreateWIFetch(bodyRequest, workProductCriterionsName);
        }

        return workProductCriterions;
    }


    async function createAlphaCriterions(alphaCriterions: [AlphaCriterion] | undefined, activities: [Activity] | undefined, states: [State] | undefined) {
        if (alphaCriterions === undefined || activities === undefined || states === undefined) return;
        let AlphaCriterionName = "Essence AlphaCriterion";
        for (let alphaCriterion of alphaCriterions) {
            let title = CreateRequestBodyWIObject({path: "/fields/Title", value: 'alphaCriterion'});
            let type = CreateRequestBodyWIObject({
                path: "/fields/Type",
                value: `${alphaCriterion.criterionTypeEnumValue}`
            });
            let partial = CreateRequestBodyWIObject({path: "/fields/IsPartial", value: `${alphaCriterion.partial}`});
            let minimal = CreateRequestBodyWIObject({path: "/fields/Minimal", value: `${alphaCriterion.minimal}`});

            let duplicateState = states.find(s => s.id === alphaCriterion.stateId);
            let stateReferenceValue: WorkItemRelation = {
                attributes: {
                    isLocked: false,
                    comment: `alphaCriterions is a duplicate of State ${duplicateState?.name}`,
                    name: 'Duplicate Of'
                },
                rel: 'System.LinkTypes.Duplicate-Reverse',
                url: `${projectData.vssRestClientOptions.rootPath}${projectData.projectId}/_apis/wit/wokrItems/${duplicateState?.WIId}`

            };
            let stateReference = CreateRequestBodyWIObject({
                path: "/relations/System.LinkTypes.Duplicate-Reverse",
                value: stateReferenceValue
            });

            let parentActivity = activities.find(a => a.id === alphaCriterion.activityId);
            let activityReferenceValue: WorkItemRelation = {
                attributes: {
                    isLocked: false,
                    comment: `alphaCriterions is a child of Activity ${parentActivity?.name}`,
                    name: 'Parent'
                },
                rel: 'System.LinkTypes.Hierarchy-Reverse',
                url: `${projectData.vssRestClientOptions.rootPath}${projectData.projectId}/_apis/wit/wokrItems/${parentActivity?.WIId}`

            };
            let activityReference = CreateRequestBodyWIObject({
                path: "/relations/System.LinkTypes.Hierarchy-Reverse",
                value: activityReferenceValue
            });
            let bodyRequest: WIRequestBodyData[] = [title, type, partial, minimal, stateReference, activityReference];
            alphaCriterion.WIId = await CreateWIFetch(bodyRequest, AlphaCriterionName);

        }
        return alphaCriterions;
    }

    for (let data of dataCollection) {//???
        data.alphas = await createAlphas(data.alphas, data.alphaContainments);
        console.log("alphas created")
        data.states = await createStates(data.states, data.alphas)
        console.log("states created")
        data.workProducts = await createWorkProductDefinitions(data.workProducts, data.workProductManifests, data.alphas);
        console.log("WorkProductDefinitions created")
        data.activities = await createActivities(data.activities)
        console.log("Activities created")
        data.levelOfDetails = await createLevelOfDetails(data.levelOfDetails, data.workProducts);
        console.log("levelOfDetails created")
        //EssenceWorkProductCriterion
        data.workProductCriterions = await createWorkProductCriterions(data.workProductCriterions, data.activities, data.levelOfDetails);
        console.log("EssenceWorkProductCriterion created")
        //EssenceAlphaCriterion.
        data.alphaCriterions = await createAlphaCriterions(data.alphaCriterions, data.activities, data.states);
        console.log("EssenceAlphaCriterion created")
        data.checkpoints = await createCheckpoints(data.checkpoints, data.states, data.levelOfDetails);
        console.log("checkpoints created")

    }

    async function CreateWIFetch(bodyRequest: WIRequestBodyData[], WITName: string) {
        let WIId = "-1";
        await AzureFetch({
            path: `${projectData.projectId}/_apis/wit/workitems/$${WITName}`,
            vssRestClientOptions: projectData.vssRestClientOptions,
            method: 'POST',
            body: JSON.stringify(bodyRequest),
            contentType: "application/json-patch+json"
        }).then(res => res.json()).then(json => {
            console.log(json);
            WIId = json.id;//TODO:check that response was OK and return WIid,otherwise console.log problem info
        });
        return WIId
    }

}


function CreateRequestBodyWIObject(params: WIRequestBodyData): WIRequestBodyData {
    //default op:"add",from:null
    return {
        op: params.op ?? "add",
        path: params.path,
        from: params.from ?? null,
        value: params.value
    };
}