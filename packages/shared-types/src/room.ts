import { z } from 'zod';
import { AuraMetricSchema } from './metrics.js';

export const RoomRoleSchema = z.enum(['candidate', 'interviewer', 'observer']);
export type RoomRole = z.infer<typeof RoomRoleSchema>;

export const ParticipantSchema = z.object({
  peerId: z.string(),
  role: RoomRoleSchema,
});
export type Participant = z.infer<typeof ParticipantSchema>;

export const RTCDescriptionSchema = z.object({
  type: z.string(),
  sdp: z.string(),
});

export const RTCIceCandidateSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable(),
  sdpMLineIndex: z.number().nullable(),
});

export const RoomToServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.join'), payload: z.object({ role: RoomRoleSchema }) }),
  z.object({ type: z.literal('room.leave') }),
  z.object({
    type: z.literal('signal.offer'),
    payload: z.object({ description: RTCDescriptionSchema }),
  }),
  z.object({
    type: z.literal('signal.answer'),
    payload: z.object({ description: RTCDescriptionSchema }),
  }),
  z.object({
    type: z.literal('signal.ice-candidate'),
    payload: z.object({ candidate: RTCIceCandidateSchema }),
  }),
  z.object({
    type: z.literal('metrics.update'),
    payload: z.object({ metrics: z.array(AuraMetricSchema) }),
  }),
]);
export type RoomToServerMessage = z.infer<typeof RoomToServerMessageSchema>;

export const RoomToClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('room.joined'),
    payload: z.object({ peerId: z.string(), participants: z.array(ParticipantSchema) }),
  }),
  z.object({
    type: z.literal('room.participants'),
    payload: z.object({ participants: z.array(ParticipantSchema) }),
  }),
  z.object({ type: z.literal('room.peer-joined'), payload: ParticipantSchema }),
  z.object({ type: z.literal('room.peer-left'), payload: z.object({ peerId: z.string() }) }),
  z.object({
    type: z.literal('room.error'),
    payload: z.object({ code: z.string(), message: z.string() }),
  }),
  z.object({
    type: z.literal('signal.offer'),
    payload: z.object({ from: z.string(), description: RTCDescriptionSchema }),
  }),
  z.object({
    type: z.literal('signal.answer'),
    payload: z.object({ from: z.string(), description: RTCDescriptionSchema }),
  }),
  z.object({
    type: z.literal('signal.ice-candidate'),
    payload: z.object({ from: z.string(), candidate: RTCIceCandidateSchema }),
  }),
  z.object({
    type: z.literal('metrics.update'),
    payload: z.object({ from: z.string(), metrics: z.array(AuraMetricSchema) }),
  }),
]);
export type RoomToClientMessage = z.infer<typeof RoomToClientMessageSchema>;
