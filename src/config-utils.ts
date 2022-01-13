import { ConfigurationScope, ConfigurationTarget, workspace } from 'vscode';

type InspectReturnValue<C extends { [key: string]: any }, K extends keyof C> = {
  key: string;
  defaultValue?: C[K];
  globalValue?: C[K];
  workspaceValue?: C[K];
  workspaceFolderValue?: C[K];
  defaultLanguageValue?: C[K];
  globalLanguageValue?: C[K];
  workspaceLanguageValue?: C[K];
  workspaceFolderLanguageValue?: C[K];
  languageIds?: string[];
};

export function ConfigurationGetter<C extends { [key: string]: any }>(
  section: string
) {
  return <K extends keyof C>(
    subsection: K,
    scope?: ConfigurationScope | null,
    defaultValue?: C[K]
  ) => {
    const config = workspace.getConfiguration(section, scope);
    // @ts-expect-error subsection is always of type string, though the compiler doesn't see it
    return config.get<C[K] | undefined>(subsection, defaultValue);
  };
}

export function ConfigurationInspector<C extends { [key: string]: any }>(
  section: string
) {
  return <K extends keyof C>(
    subsection: K,
    scope?: ConfigurationScope | null
  ): InspectReturnValue<C, K> => {
    const config = workspace.getConfiguration(section, scope);
    // @ts-expect-error subsection is always of type string, though the compiler doesn't see it
    return config.inspect(subsection);
  };
}

export function ConfigurationSetter<C extends { [key: string]: any }>(
  section: string
) {
  return <K extends keyof C>(
    subsection: K,
    value: C[K],
    scope?: ConfigurationScope | null,
    configurationTarget?: boolean | ConfigurationTarget | null,
    overrideInLanguage?: boolean
  ) => {
    const config = workspace.getConfiguration(section, scope);
    return config.update(
      // @ts-expect-error subsection is always of type string, though the compiler doesn't see it
      subsection,
      value,
      configurationTarget,
      overrideInLanguage
    );
  };
}

interface IGet<C extends { [key: string]: any }> {
  get<K extends keyof C>(
    subsection: K,
    scope?: ConfigurationScope | null
  ): C[K] | undefined;
  get<K extends keyof C>(
    subsection: K,
    scope: ConfigurationScope | null | undefined,
    defaultValue: C[K]
  ): C[K];
}

interface IInspect<C extends { [key: string]: any }> {
  inspect<K extends keyof C>(
    subsection: K
  ): InspectReturnValue<C, K> | undefined;
}

interface IUpdate<C extends { [key: string]: any }> {
  update<K extends keyof C>(
    subsection: K,
    value: C[K],
    scope?: ConfigurationScope,
    configurationTarget?: boolean | ConfigurationTarget,
    overrideInLanguage?: boolean
  ): Thenable<void>;
}

export class VSCodeConfigurations<C extends { [key: string]: any }>
  implements IGet<C>, IUpdate<C>, IInspect<C>
{
  private _get: <K extends keyof C>(
    subsection: K,
    scope?: ConfigurationScope | null,
    defaultValue?: C[K]
  ) => C[K] | undefined;
  private _inspect: <K extends keyof C>(
    subsection: K
  ) => InspectReturnValue<C, K>;
  private _update: <K extends keyof C>(
    subsection: K,
    value: C[K],
    scope?: ConfigurationScope | null,
    configurationTarget?: boolean | ConfigurationTarget | null,
    overrideInLanguage?: boolean
  ) => Thenable<void>;

  constructor(readonly section: string) {
    this._get = ConfigurationGetter<C>(section);
    this._update = ConfigurationSetter<C>(section);
    this._inspect = ConfigurationInspector<C>(section);
  }

  update<K extends keyof C>(
    subsection: K,
    value: C[K],
    scope?: ConfigurationScope,
    configurationTarget?: boolean | ConfigurationTarget,
    overrideInLanguage?: boolean
  ): Thenable<void> {
    return this._update(
      subsection,
      value,
      scope,
      configurationTarget,
      overrideInLanguage
    );
  }

  inspect<K extends keyof C>(
    subsection: K
  ): InspectReturnValue<C, K> | undefined {
    return this._inspect(subsection);
  }

  get<K extends keyof C>(
    subsection: K,
    scope?: ConfigurationScope | null
  ): C[K] | undefined;
  get<K extends keyof C>(
    subsection: K,
    scope: ConfigurationScope | null | undefined,
    defaultValue: C[K]
  ): C[K];
  get(subsection: any, scope?: any, defaultValue?: any) {
    return this._get(subsection, scope, defaultValue);
  }
}
