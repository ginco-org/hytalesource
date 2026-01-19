import { Divider, Flex, Space } from "antd";
import { useObservable } from "../utils/UseObservable";
import { AboutModalButton } from "./AboutModal";
import { SettingsModalButton } from "./SettingsModal";

const Header = () => {
    return (
        <div>
            <Flex justify="center" style={{ width: '100%', paddingTop: 8 }}>
                <HeaderBody />
            </Flex>
            <Divider size="small" />
        </div>
    );
};

export const HeaderBody = () => {
    return (
        <Space align="center">
            <h2 style={{ margin: 0 }}>Hytale Source</h2>
            <SettingsModalButton />
            <AboutModalButton />
        </Space>
    );
};

export default Header;