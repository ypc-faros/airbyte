import { QueryClient, useMutation, useQueryClient } from "react-query";

import { getFrequencyConfig } from "config/utils";
import { SyncSchema } from "core/domain/catalog";
import { WebBackendConnectionService } from "core/domain/connection";
import { ConnectionService } from "core/domain/connection/ConnectionService";
import { TrackActionLegacyType, useTrackAction, TrackActionNamespace, TrackActionType } from "hooks/useTrackAction";
import { useInitService } from "services/useInitService";

import { useConfig } from "../../config";
import {
  ConnectionSchedule,
  DestinationRead,
  NamespaceDefinitionType,
  OperationCreate,
  SourceDefinitionRead,
  SourceRead,
  WebBackendConnectionRead,
  WebBackendConnectionUpdate,
} from "../../core/request/AirbyteClient";
import { useSuspenseQuery } from "../../services/connector/useSuspenseQuery";
import { SCOPE_WORKSPACE } from "../../services/Scope";
import { useDefaultRequestMiddlewares } from "../../services/useDefaultRequestMiddlewares";
import { useCurrentWorkspace } from "./useWorkspace";

export const connectionsKeys = {
  all: [SCOPE_WORKSPACE, "connections"] as const,
  lists: () => [...connectionsKeys.all, "list"] as const,
  list: (filters: string) => [...connectionsKeys.lists(), { filters }] as const,
  detail: (connectionId: string) => [...connectionsKeys.all, "details", connectionId] as const,
  getState: (connectionId: string) => [...connectionsKeys.all, "getState", connectionId] as const,
};

export interface ValuesProps {
  name?: string;
  schedule?: ConnectionSchedule;
  prefix: string;
  syncCatalog: SyncSchema;
  namespaceDefinition: NamespaceDefinitionType;
  namespaceFormat?: string;
  operations?: OperationCreate[];
}

interface CreateConnectionProps {
  values: ValuesProps;
  source: SourceRead;
  destination: DestinationRead;
  sourceDefinition?: Pick<SourceDefinitionRead, "sourceDefinitionId">;
  destinationDefinition?: { name: string; destinationDefinitionId: string };
  sourceCatalogId: string | undefined;
}

export interface ListConnection {
  connections: WebBackendConnectionRead[];
}

/** "WebConnectionService" = API endpoints specifically for consumption by the frontend */

function useWebConnectionService() {
  const config = useConfig();
  const middlewares = useDefaultRequestMiddlewares();
  return useInitService(
    () => new WebBackendConnectionService(config.apiUrl, middlewares),
    [config.apiUrl, middlewares]
  );
}

/** "ConnectionService" = more general endpoints, reading directly from the db */

export function useConnectionService() {
  const config = useConfig();
  const middlewares = useDefaultRequestMiddlewares();
  return useInitService(() => new ConnectionService(config.apiUrl, middlewares), [config.apiUrl, middlewares]);
}

/** returns a connection and a method to refresh its catalog */

export const useConnectionLoad = (
  connectionId: string
): {
  connection: WebBackendConnectionRead;
  refreshConnectionCatalog: () => Promise<WebBackendConnectionRead>;
} => {
  const connection = useGetConnection(connectionId);
  const connectionService = useWebConnectionService();

  const refreshConnectionCatalog = async () => await connectionService.getConnection(connectionId, true);

  return {
    connection,
    refreshConnectionCatalog,
  };
};

/** trigger a sync (todo: is this really only full refresh syncs like the segment call implies?) */

export const useSyncConnection = () => {
  const service = useConnectionService();
  const trackSourceAction = useTrackAction(TrackActionNamespace.SOURCE, TrackActionLegacyType.SOURCE);

  return useMutation((connection: WebBackendConnectionRead) => {
    const frequency = getFrequencyConfig(connection.schedule);

    trackSourceAction("Full refresh sync", TrackActionType.SYNC, {
      connector_source: connection.source?.sourceName,
      connector_source_definition_id: connection.source?.sourceDefinitionId,
      connector_destination: connection.destination?.name,
      connector_destination_definition_id: connection.destination?.destinationDefinitionId,
      frequency: frequency?.type,
    });

    return service.sync(connection.connectionId);
  });
};

/** trigger a connection reset */

export const useResetConnection = () => {
  const service = useConnectionService();

  return useMutation((connectionId: string) => service.reset(connectionId));
};

const useGetConnection = (connectionId: string, options?: { refetchInterval: number }): WebBackendConnectionRead => {
  const service = useWebConnectionService();

  return useSuspenseQuery(connectionsKeys.detail(connectionId), () => service.getConnection(connectionId), options);
};

/** create a connection */

const useCreateConnection = () => {
  const service = useWebConnectionService();
  const queryClient = useQueryClient();
  const trackNewConnectionAction = useTrackAction(
    TrackActionNamespace.CONNECTION,
    TrackActionLegacyType.NEW_CONNECTION
  );

  return useMutation(
    async ({
      values,
      source,
      destination,
      sourceDefinition,
      destinationDefinition,
      sourceCatalogId,
    }: CreateConnectionProps) => {
      const response = await service.create({
        sourceId: source.sourceId,
        destinationId: destination.destinationId,
        ...values,
        status: "active",
        sourceCatalogId,
      });

      const enabledStreams = values.syncCatalog.streams.filter((stream) => stream.config?.selected).length;

      const frequencyData = getFrequencyConfig(values.schedule);

      trackNewConnectionAction("Set up connection", TrackActionType.CREATE, {
        frequency: frequencyData?.type || "",
        connector_source_definition: source?.sourceName,
        connector_source_definition_id: sourceDefinition?.sourceDefinitionId,
        connector_destination_definition: destination?.destinationName,
        connector_destination_definition_id: destinationDefinition?.destinationDefinitionId,
        available_streams: values.syncCatalog.streams.length,
        enabled_streams: enabledStreams,
      });

      return response;
    },
    {
      onSuccess: (data) => {
        queryClient.setQueryData(connectionsKeys.lists(), (lst: ListConnection | undefined) => ({
          connections: [data, ...(lst?.connections ?? [])],
        }));
      },
    }
  );
};

/** delete a connection */

const useDeleteConnection = () => {
  const service = useConnectionService();
  const queryClient = useQueryClient();

  return useMutation((connectionId: string) => service.delete(connectionId), {
    onSuccess: (_data, connectionId) => {
      queryClient.removeQueries(connectionsKeys.detail(connectionId));
      queryClient.setQueryData(
        connectionsKeys.lists(),
        (lst: ListConnection | undefined) =>
          ({
            connections: lst?.connections.filter((conn) => conn.connectionId !== connectionId) ?? [],
          } as ListConnection)
      );
    },
  });
};

/** update a connection */

const useUpdateConnection = () => {
  const service = useWebConnectionService();
  const queryClient = useQueryClient();

  return useMutation((connectionUpdate: WebBackendConnectionUpdate) => service.update(connectionUpdate), {
    onSuccess: (connection) => {
      queryClient.setQueryData(connectionsKeys.detail(connection.connectionId), connection);
    },
  });
};

/** get a list of connections */

const useConnectionList = (): ListConnection => {
  const workspace = useCurrentWorkspace();
  const service = useWebConnectionService();

  return useSuspenseQuery(connectionsKeys.lists(), () => service.list(workspace.workspaceId));
};

/** invalidate the useQuery cache... todo: why is this not a `use...` like the others? */

const invalidateConnectionsList = async (queryClient: QueryClient) => {
  await queryClient.invalidateQueries(connectionsKeys.lists());
};

/** get a connection's state */

const useGetConnectionState = (connectionId: string) => {
  const service = useConnectionService();

  return useSuspenseQuery(connectionsKeys.getState(connectionId), () => service.getState(connectionId));
};

export {
  useConnectionList,
  useGetConnection,
  useUpdateConnection,
  useCreateConnection,
  useDeleteConnection,
  invalidateConnectionsList,
  useGetConnectionState,
};
