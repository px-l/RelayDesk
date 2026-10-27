import {z} from 'zod';
const id=z.string().min(1).max(128);const engine=z.enum(['demo','demo-review','dsh','workbuddy']);
const flow=z.object({preparation:z.boolean(),review:z.boolean(),mode:z.enum(['rules','agent'])}).strict();
const requirement=z.object({id,title:z.string().trim().min(1).max(300),required:z.boolean(),keywords:z.array(z.string().trim().min(1).max(100)).max(8)}).strict();
const handoff=z.object({goal:z.string().min(1).max(20000),completed:z.string().max(20000),findings:z.string().max(20000),unresolved:z.string().max(20000),next:z.string().min(1).max(20000),artifactIds:z.array(id).max(100)}).strict();
export const requestSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('snapshot')}).strict(),z.object({op:z.literal('workspace.create')}).strict(),
 z.object({op:z.literal('task.create'),workspaceId:id,engine,goal:z.string().trim().min(1).max(100000),flow:flow.optional()}).strict(),
 ...(['task.detail','task.start','task.cancel','task.recover','task.inputs','task.artifacts','handoff.draft'] as const).map(op=>z.object({op:z.literal(op),taskId:id}).strict()),
 z.object({op:z.literal('task.approve'),taskId:id,requestId:id,optionId:id}).strict(),
 z.object({op:z.literal('handoff.create'),taskId:id,engine,handoff}).strict(),
 ...(['artifact.preview','artifact.export','artifact.open','artifact.reveal'] as const).map(op=>z.object({op:z.literal(op),artifactId:id}).strict()),
 z.object({op:z.literal('flow.configure'),taskId:id,options:flow}).strict(),
 z.object({op:z.literal('flow.prepare'),taskId:id,requirements:z.array(requirement).min(1).max(20).refine(rs=>new Set(rs.map(r=>r.id)).size===rs.length,'要求标识不能重复'),consent:z.boolean()}).strict(),
 z.object({op:z.literal('flow.confirm'),taskId:id,preparationId:id,constraints:z.string().max(10000),acceptedGaps:z.boolean(),reviewConsent:z.boolean()}).strict(),
 z.object({op:z.literal('flow.review'),taskId:id,artifactIds:z.array(id).max(6).refine(ids=>new Set(ids).size===ids.length,'成果不能重复'),includeAnswer:z.boolean(),consent:z.boolean()}).strict(),
 z.object({op:z.literal('flow.repair'),taskId:id,reviewId:id}).strict(),
 z.object({op:z.literal('flow.export'),taskId:id,reviewId:id}).strict(),
 z.object({op:z.literal('task.artifact.import'),taskId:id}).strict(),
 z.object({op:z.literal('task.input.remove'),taskId:id,inputId:id}).strict(),
 z.object({op:z.literal('settings.get')}).strict(),z.object({op:z.literal('settings.save'),settings:z.object({dshExecutable:z.string().max(4096).optional(),workbuddyToken:z.string().max(32000).optional(),clearToken:z.boolean().optional(),reviewApiKey:z.string().max(32000).optional(),clearReviewKey:z.boolean().optional(),reviewModel:z.string().trim().min(1).max(128).optional(),pythonExecutable:z.string().max(4096).optional()}).strict()}).strict(),
 z.object({op:z.literal('engine.check'),engine}).strict()
]);
