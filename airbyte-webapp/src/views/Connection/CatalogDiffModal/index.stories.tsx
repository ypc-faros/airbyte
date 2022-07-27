import { ComponentMeta, ComponentStory } from "@storybook/react";

import {
  AirbyteCatalog,
  CatalogDiff,
  DestinationSyncMode,
  FieldTransformTransformType,
  StreamTransformTransformType,
  SyncMode,
} from "core/request/AirbyteClient";
import { useModalService } from "hooks/services/Modal";

import { CatalogDiffModal } from "./CatalogDiffModal";

export default {
  title: "Ui/CatalogDiffModal",
  component: CatalogDiffModal,
  //renders a json-based text editor for these args
  argTypes: {
    catalogDiff: { control: "object" },
    catalog: { control: "object" },
  },
} as ComponentMeta<typeof CatalogDiffModal>;

const Template: ComponentStory<typeof CatalogDiffModal> = (args) => {
  return <CatalogDiffModal {...args} />;
};

const sampleDiff: CatalogDiff = {
  transforms: [
    {
      transformType: StreamTransformTransformType.add_stream,
      streamDescriptor: { namespace: "apple", name: "banana" },
    },
    {
      transformType: StreamTransformTransformType.add_stream,
      streamDescriptor: { namespace: "apple", name: "carrot" },
    },
    {
      transformType: StreamTransformTransformType.remove_stream,
      streamDescriptor: { namespace: "apple", name: "dragonfruit" },
    },
    {
      transformType: StreamTransformTransformType.remove_stream,
      streamDescriptor: { namespace: "apple", name: "eclair" },
    },
    {
      transformType: StreamTransformTransformType.remove_stream,
      streamDescriptor: { namespace: "apple", name: "fishcake" },
    },
    {
      transformType: StreamTransformTransformType.remove_stream,
      streamDescriptor: { namespace: "apple", name: "gelatin_mold" },
    },
    {
      transformType: StreamTransformTransformType.update_stream,
      streamDescriptor: { namespace: "apple", name: "users" },
      updateStream: [
        { transformType: FieldTransformTransformType.add_field, fieldName: ["users", "phone"] },
        { transformType: FieldTransformTransformType.add_field, fieldName: ["users", "email"] },
        { transformType: FieldTransformTransformType.remove_field, fieldName: ["users", "lastName"] },

        {
          transformType: FieldTransformTransformType.update_field_schema,
          fieldName: ["users", "address"],
          updateFieldSchema: { oldSchema: { type: "number" }, newSchema: { type: "string" } },
        },
      ],
    },
  ],
};

//not a full airbyte catalog... only passing required/used parts for this component
const sampleCatalog: AirbyteCatalog = {
  streams: [
    {
      stream: {
        namespace: "apple",
        name: "dragonfruit",
      },
      config: {
        syncMode: SyncMode.full_refresh,
        destinationSyncMode: DestinationSyncMode.append,
      },
    },
    {
      stream: { namespace: "apple", name: "eclair" },
      config: {
        syncMode: SyncMode.incremental,
        destinationSyncMode: DestinationSyncMode.append,
      },
    },
    {
      stream: { namespace: "apple", name: "fishcake" },
      config: {
        syncMode: SyncMode.incremental,
        destinationSyncMode: DestinationSyncMode.append_dedup,
      },
    },
    {
      stream: { namespace: "apple", name: "gelatin_mold" },
      config: { syncMode: SyncMode.full_refresh, destinationSyncMode: DestinationSyncMode.overwrite },
    },
  ],
};
export const DiffWithAllChangeTypes = Template.bind({});
DiffWithAllChangeTypes.args = {
  catalogDiff: sampleDiff,
  catalog: sampleCatalog,
};
