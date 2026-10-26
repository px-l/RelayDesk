import {z} from 'zod';
const id=z.string().min(1).max(128);const engine=z.enum(['demo','demo-review','dsh','workbuddy']);
const handoff=z.object({goal:z.string().min(1).max(20000),completed:z.string().max(20000),findings:z.string().max(20000),unresolved:z.string().max(20000),next:z.string().min(1).max(20000),artifactIds:z.array(id).max(100)}).strict();
export const requestSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('snapshot')}).strict(),z.object({op:z.literal('workspace.create')}).strict(),
 z.object({op:z.literal('task.create'),workspaceId:id,engine,goal:z.string().trim().min(1).max(100000)}).strict(),
 ...(['task.detail','task.start','task.cancel','task.recover','task.inputs','task.artifacts','handoff.draft'] as const).map(op=>z.object({op:z.literal(op),taskId:id}).strict()),
 z.object({op:z.literal('task.approve'),taskId:id,requestId:id,optionId:id}).strict(),
 z.object({op:z.literal('handoff.create'),taskId:id,engine,handoff}).strict(),
 ...(['artifact.preview','artifact.export','artifact.open','artifact.reveal'] as const).map(op=>z.object({op:z.literal(op),artifactId:id}).strict()),
 z.object({op:z.literal('settings.get')}).strict(),z.object({op:z.literal('settings.save'),settings:z.object({dshExecutable:z.string().max(4096).optional(),workbuddyToken:z.string().max(32000).optional(),clearToken:z.boolean().optional()}).strict()}).strict(),
 z.object({op:z.literal('engine.check'),engine}).strict()
]);
